const axios = require("axios");
require("dotenv").config();

/**
 * 리뷰 데이터를 분석하여 장점, 단점, 전반적인 평가를 JSON으로 반환하는 함수
 * @param {string[]} reviews
 * @returns {Promise<Object>}
 */
async function analyzeReviews(reviews) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "GEMINI_API_KEY가 환경변수에 설정되지 않았습니다.",
    };
  }

  const MODEL_ID = "gemini-2.5-flash-lite";
  const API_URL = `https://generativelanguage.googleapis.com/v1/models/${MODEL_ID}:generateContent`;

  try {
    // 리뷰가 없는 경우 처리
    if (!reviews || reviews.length === 0) {
      return {
        success: false,
        error: "분석할 리뷰가 없습니다.",
      };
    }

    // 모든 리뷰를 하나의 텍스트로 결합 (길이 제한으로 TPM 초과 방지)
    const combinedReviews = reviews.join("\n\n");
    const truncatedReviews = combinedReviews.length > 5000
      ? combinedReviews.slice(0, 5000) + "..."
      : combinedReviews;

    console.log(`[요청] 모델: ${MODEL_ID}, 리뷰: ${reviews.length}개, 텍스트 길이: ${truncatedReviews.length}자`);

    // Gemini API에 보낼 프롬프트 작성
    const prompt = `다음은 패션 제품에 대한 여러 리뷰입니다. 이 리뷰들을 분석하여 아래 JSON 형식으로 요약해주세요. 말투는 친근한 느낌을 주는 말투를 사용해주세요:

${truncatedReviews}

다음 JSON 형식으로만 응답해주세요:
{
  "pros": ["장점1", "장점2", "장점3", "장점4", "장점5"],
  "cons": ["단점1", "단점2", "단점3", "단점4", "단점5"],
  "ratio": "긍정:중립:부정", // 전체 리뷰중 '긍적적인 내용의 리뷰', '긍정과 부정이 둘 다 있거나 중립적인 내용의 리뷰', '부정적인 내용 리뷰'의 비율을 추정해주세요.
  "summary": "전반적인 평가 요약 (100자 이내)",
  "size": "제품 사이즈에 관한 평가 (70자 이내)",
  "recommendation": "추천 대상 (70자 이내)"
}`;

    // Gemini API 호출 (response_mime_type으로 JSON만 받기)
    const response = await axios.post(
      `${API_URL}?key=${apiKey}`,
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Gemini API 응답 받음");

    // API 응답에서 텍스트 추출
    let responseText = response.data.candidates[0].content.parts[0].text;

    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    console.log("파싱할 텍스트:", responseText.substring(0, 200) + "...");

    // JSON 파싱
    try {
      const jsonResult = JSON.parse(responseText);

      // 전체 리뷰 개수 추가
      jsonResult.total_reviews = reviews.length;

      console.log("JSON 파싱 성공");
      return {
        success: true,
        data: jsonResult,
      };
    } catch (parseError) {
      console.error("JSON 파싱 오류:", parseError);
      return {
        success: false,
        error: "JSON 파싱 오류",
        raw_response: responseText,
      };
    }
  } catch (error) {
    // 429 에러 발생 시 상세 로깅
    if (error.response?.status === 429) {
      console.error("[429 Error] 할당량 초과.");
      console.error("상태 코드:", error.response.status);
      console.error("에러 상세:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Gemini API 요청 오류:", error.message);
      if (error.response) {
        console.error(
          "API 오류 응답:",
          JSON.stringify(error.response.data, null, 2)
        );
      }
    }

    return {
      success: false,
      error: error.response?.data?.error?.message || error.message,
      details: error.response?.data || {},
      statusCode: error.response?.status,
    };
  }
}

module.exports = { analyzeReviews };
