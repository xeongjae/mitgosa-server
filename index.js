const express = require("express");
const cors = require("cors");
const app = express();
const crawlMusinsa = require("./src/crawlers/musinsa");
const crawlTwentyNine = require("./src/crawlers/twentynine");
const crawlZigzag = require("./src/crawlers/zigzag");
const { analyzeReviews } = require("./src/analyzers/geminiAnalyzer");
require("dotenv").config();

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
