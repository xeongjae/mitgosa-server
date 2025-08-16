const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();
const crawlMusinsa = require("./src/crawlers/musinsa");
const crawlTwentyNine = require("./src/crawlers/twentynine");
const crawlZigzag = require("./src/crawlers/zigzag");
const { analyzeReviews } = require("./src/analyzers/geminiAnalyzer");
require("dotenv").config();

// 프록시 환경에서 실제 IP 인식을 위한 설정
app.set("trust proxy", true);

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173", // 로컬
      "https://mitgosa.vercel.app", // 프로덕션
    ],
    credentials: true,
  })
);

// 통계 파일 경로
const statsFile = path.join(__dirname, "stats.json");

// 통계 데이터 로드
function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(statsFile, "utf8"));
  } catch {
    return {
      totalVisitors: 0,
      totalAnalysis: 0,
      dailyStats: {},
      visitedIPs: {}, // IP별 마지막 방문시간 저장
    };
  }
}

// 통계 데이터 저장
function saveStats(stats) {
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
}

// 방문자 통계 추적 미들웨어 (30분 세션 기반)
app.use((req, res, next) => {
  try {
    const stats = loadStats();
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    // 더 안정적인 IP 추출
    let clientIP = req.ip || req.socket.remoteAddress || "unknown";

    // x-forwarded-for 헤더 처리 (첫 번째 IP만 사용)
    if (req.headers["x-forwarded-for"]) {
      const forwardedIPs = req.headers["x-forwarded-for"].split(",");
      clientIP = forwardedIPs[0].trim();
    }

    console.log(`클라이언트 IP: ${clientIP}`);

    // 오늘 날짜 초기화
    if (!stats.dailyStats[today]) {
      stats.dailyStats[today] = {
        visitors: 0,
        analysis: 0,
      };
    }

    // 세션 타임아웃 체크 (30분 = 30 * 60 * 1000ms)
    const SESSION_TIMEOUT = 30 * 60 * 1000;

    // visitedIPs가 객체인지 확인하고 초기화
    if (!stats.visitedIPs || typeof stats.visitedIPs !== "object") {
      stats.visitedIPs = {};
    }

    const lastVisit = stats.visitedIPs[clientIP];
    const isNewSession =
      !lastVisit ||
      now.getTime() - new Date(lastVisit).getTime() > SESSION_TIMEOUT;

    // 새로운 세션인 경우 방문자로 카운트
    if (isNewSession) {
      stats.totalVisitors++;
      stats.dailyStats[today].visitors++;
      stats.visitedIPs[clientIP] = now.toISOString();

      console.log(
        `새로운 방문자: ${clientIP} (총 ${stats.totalVisitors}명, 오늘 ${stats.dailyStats[today].visitors}명)`
      );
      saveStats(stats);
    }

    next();
  } catch (error) {
    console.error("통계 처리 오류:", error);
    next(); // 통계 오류가 있어도 계속 진행
  }
});

function detectPlatform(url) {
  if (url.includes("musinsa.com")) {
    return "musinsa";
  } else if (url.includes("29cm.co.kr")) {
    return "29cm";
  } else if (url.includes("zigzag.kr")) {
    return "zigzag";
  }
  return "unknown";
}

// 리뷰 크롤링 and Gemini API로 분석
app.post("/api/analyze", async (req, res) => {
  console.log("분석 요청 들어옴!", req.body);
  try {
    const url = req.body.url;
    if (!url) {
      return res.status(400).json({ error: "URL이 필요합니다." });
    }

    const platform = detectPlatform(url);
    console.log(`감지된 플랫폼: ${platform}`);

    let crawlResult;

    switch (platform) {
      case "musinsa":
        crawlResult = await crawlMusinsa(url);
        break;
      case "29cm":
        crawlResult = await crawlTwentyNine(url);
        break;
      case "zigzag":
        crawlResult = await crawlZigzag(url);
        break;
      default:
        return res.status(400).json({
          error:
            "지원하지 않는 쇼핑몰입니다. 무신사, 29cm, 지그재그만 지원합니다.",
        });
    }

    if (!crawlResult.reviews || crawlResult.reviews.length === 0) {
      return res.status(404).json({ error: "분석할 리뷰 데이터가 없습니다." });
    }

    console.log(`${crawlResult.reviews.length}개 리뷰 수집 완료`);

    // Gemini API로 리뷰 분석
    const analysisResult = await analyzeReviews(crawlResult.reviews);

    // 분석 실패 시 에러 응답
    if (!analysisResult.success) {
      return res.status(500).json({
        error: analysisResult.error || "분석 중 오류가 발생했습니다.",
        details: analysisResult.details || {},
      });
    }

    // 분석 성공 시 통계 업데이트
    try {
      const stats = loadStats();
      const today = new Date().toISOString().split("T")[0];

      // 총 분석 횟수 증가
      stats.totalAnalysis++;

      // 오늘 분석 횟수 증가
      if (!stats.dailyStats[today]) {
        stats.dailyStats[today] = {
          visitors: 0,
          analysis: 0,
        };
      }
      stats.dailyStats[today].analysis++;

      console.log(
        `분석 완료! 총 ${stats.totalAnalysis}번째 분석, 오늘 ${stats.dailyStats[today].analysis}번째`
      );
      saveStats(stats);
    } catch (error) {
      console.error("분석 통계 업데이트 오류:", error);
    }

    res.json({
      success: true,
      product: crawlResult.product,
      reviews: crawlResult.reviews,
      data: analysisResult.data, // 프론트엔드가 기대하는 data 필드
      platform, // 어떤 플랫폼에서 크롤링했는지 정보 추가
    });
  } catch (error) {
    console.error("분석 에러:", error);
    res
      .status(500)
      .json({ error: error.message || "분석 중 오류가 발생했습니다." });
  }
});

// 통계 조회 API
app.get("/api/stats", (req, res) => {
  try {
    const stats = loadStats();
    const today = new Date().toISOString().split("T")[0];

    res.json({
      totalVisitors: stats.totalVisitors,
      totalAnalysis: stats.totalAnalysis,
      todayVisitors: stats.dailyStats[today]?.visitors || 0,
      todayAnalysis: stats.dailyStats[today]?.analysis || 0,
    });
  } catch (error) {
    console.error("통계 조회 오류:", error);
    res.status(500).json({
      error: "통계를 불러올 수 없습니다.",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
