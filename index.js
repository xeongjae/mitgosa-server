const express = require("express");
const cors = require("cors");
const app = express();
const crawlMusinsaReviews = require("./src/crawlers/musinsa");
const { analyzeReviews } = require("./src/analyzers/geminiAnalyzer");
require("dotenv").config();

app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173",
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
    let { product, reviews } = await crawlMusinsaReviews(url);
    if (!reviews || reviews.length === 0) {
      return res.json({
        success: false,
        message: "분석할 리뷰 데이터가 없습니다.",
        product,
      });
    }
    console.log(`${reviews.length}개의 리뷰를 찾았습니다.`);

    // 크롤링한 리뷰 내용 출력
    console.log("======= 크롤링한 리뷰 내용 =======");
    reviews.forEach((review, index) => {
      console.log(
        `리뷰 ${index + 1}: ${review.substring(0, 100)}${
          review.length > 100 ? "..." : ""
        }`
      );
    });
    console.log("================================");

    // Gemini API로 리뷰 분석
    console.log("리뷰 분석 시작...");
    const analysis = await analyzeReviews(reviews, apiKey);

    // 분석 결과 상세 출력
    console.log("======= AI 분석 결과 상세 =======");
    console.log(JSON.stringify(analysis, null, 2));

    if (analysis.success && analysis.data) {
      console.log("\n✅ 장점:");
      analysis.data.pros.forEach((pro) => console.log(`  • ${pro}`));

      console.log("\n❌ 단점:");
      if (analysis.data.cons && analysis.data.cons.length > 0) {
        analysis.data.cons.forEach((con) => console.log(`  • ${con}`));
      } else {
        console.log("  • 언급된 단점 없음");
      }

      if (analysis.data.overall_rating) {
        console.log(`\n⭐ 평점: ${analysis.data.overall_rating}`);
      }

      console.log(`\n📝 요약: ${analysis.data.summary}`);
      console.log(`\n🎯 추천 대상: ${analysis.data.recommendation}`);
    }
    console.log("================================");

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
