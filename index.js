const express = require("express");
const cors = require("cors");
const app = express();
const crawlMusinsa = require("./src/crawlers/musinsa");
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

app.get("/", (req, res) => {
  res.send("리뷰스캔 서버가 실행 중입니다!");
});

// 무신사 리뷰 크롤링 and Gemini API로 분석
app.post("/api/analyze", async (req, res) => {
  console.log("분석 요청 들어옴!", req.body);
  try {
    const url = req.body.url;
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
    let { product, reviews } = await crawlMusinsa(url);
    if (!reviews || reviews.length === 0) {
      return res.json({
        success: false,
        message: "분석할 리뷰 데이터가 없습니다.",
        product,
      });
    }
    console.log(`${reviews.length}개의 리뷰를 찾았습니다.`);

    // Gemini API로 리뷰 분석
    console.log("리뷰 분석 시작...");
    const analysis = await analyzeReviews(reviews, apiKey);

    // 결과 반환
    res.json({
      ...analysis,
      product,
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
