const express = require("express");
const cors = require("cors");
const app = express();
const crawlMusinsaReviews = require("./src/crawlers/musinsa");
const { analyzeReviews } = require("./src/analyzers/geminiAnalyzer");
require("dotenv").config();

// 간단한 IP 기반 사용량 제한 (메모리 저장)
const dailyUsageByIP = new Map();
const DAILY_LIMIT_PER_IP = 10; // IP당 일일 10회 제한

// 일일 사용량 확인 함수
const getIPDailyUsage = (ip) => {
  const today = new Date().toDateString();
  const key = `${ip}-${today}`;
  return dailyUsageByIP.get(key) || 0;
};

// 일일 사용량 증가 함수
const incrementIPDailyUsage = (ip) => {
  const today = new Date().toDateString();
  const key = `${ip}-${today}`;
  const currentUsage = dailyUsageByIP.get(key) || 0;
  dailyUsageByIP.set(key, currentUsage + 1);
};

app.use(express.json());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
  })
);

app.get("/", (req, res) => {
  res.send("리뷰스캔 서버가 실행 중입니다!");
});

// 프론트에서 상품 url을 받아 무신사 리뷰를 크롤링하는 POST 엔드포인트
app.post("/api/review", async (req, res) => {
  console.log("요청 들어옴!", req.body);
  try {
    const url = req.body.url;

    //유효성 검사
    if (!url) {
      return res.status(400).json({ success: false, message: "url 수신 실패" });
    }

    //무신사 리뷰 크롤링
    let reviews = await crawlMusinsaReviews(url);
    if (!reviews || reviews.length === 0) {
      reviews = ["리뷰 데이터가 없습니다."];
    }

    //결과 반환
    res.json({ success: true, message: reviews });
  } catch (error) {
    console.error("서버 에러 발생:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Gemini API를 사용하여 무신사 리뷰를 분석하는 POST 엔드포인트
app.post("/api/analyze", async (req, res) => {
  console.log("분석 요청 들어옴!", req.body);
  try {
    const { url } = req.body;
    const clientIP =
      req.ip || req.connection.remoteAddress || req.headers["x-forwarded-for"];

    // IP 기반 사용량 제한 확인
    const todayUsage = getIPDailyUsage(clientIP);
    if (todayUsage >= DAILY_LIMIT_PER_IP) {
      return res.status(429).json({
        success: false,
        message: `일일 사용량 제한(${DAILY_LIMIT_PER_IP}회)을 초과했습니다. 내일 다시 시도해주세요.`,
        remainingUsage: 0,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // API 키 확인
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message:
          "GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.",
      });
    }

    // URL 유효성 검사
    if (!url) {
      return res.status(400).json({ success: false, message: "url 수신 실패" });
    }

    // 무신사 리뷰 크롤링
    console.log("리뷰 크롤링 시작...");
    let { product, reviews } = await crawlMusinsaReviews(url);
    if (!reviews || reviews.length === 0) {
      return res.json({
        success: false,
        message: "분석할 리뷰 데이터가 없습니다.",
        product,
      });
    }
    console.log(`${reviews.length}개의 리뷰를 찾았습니다.`);

    // 사용량 증가
    incrementIPDailyUsage(clientIP);

    // Gemini API로 리뷰 분석
    console.log("리뷰 분석 시작...");
    const analysis = await analyzeReviews(reviews, apiKey);

    // 결과 반환
    res.json({
      ...analysis,
      product,
      remainingUsage: Math.max(
        0,
        DAILY_LIMIT_PER_IP - getIPDailyUsage(clientIP)
      ),
    });
  } catch (error) {
    console.error("분석 중 에러 발생:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

const PORT = 4000;

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
