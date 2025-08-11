const axios = require("axios");
require("dotenv").config();

/**
 * 리뷰 데이터를 분석하여 장점, 단점, 전반적인 평가를 JSON으로 반환하는 함수
 * @param {string[]} reviews
 * @returns {Promise<Object>} - 분석 결과 JSON 객체
 */
async function analyzeReviews(reviews) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "GEMINI_API_KEY가 환경변수에 설정되지 않았습니다.",
    };
  }

  const API_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  try {
    // 리뷰가 없는 경우 처리
    if (!reviews || reviews.length === 0) {
      console.log("분석할 리뷰가 없습니다.");
      return {
        success: false,
        error: "분석할 리뷰가 없습니다.",
      };
    }

    // 모든 리뷰를 하나의 텍스트로 결합
    const combinedReviews = reviews.join("\n\n");
    console.log(
      `총 ${reviews.length}개의 리뷰를 결합했습니다. (총 길이: ${combinedReviews.length}자)`
    );

    // Gemini API에 보낼 프롬프트 작성
    const prompt = `
    다음은 패션 제품에 대한 여러 리뷰입니다. 이 리뷰들을 분석하여 아래 JSON 형식으로 요약해주세요 말투는 친근한 느낌을 주는 말투를 사용해주세요:
    
    ${combinedReviews}
    
    다음 JSON 형식으로만 응답해주세요:
    {
      "pros": ["장점1", "장점2", "장점3", "장점4", "장점5"], // 가장 자주 언급된 장점 최대 5개를 문장으로 풀어 써주세요.
      "cons": ["단점1", "단점2", "단점3", "단점4", "단점5"], // 가장 자주 언급된 단점 최대 5개를 문장으로 풀어 써주세요.
      "ratio": "긍정:중립:부정", // 전체 리뷰중 '긍적적인 내용의 리뷰', '긍정과 부정이 둘 다 있거나 중립적인 내용의 리뷰', '부정적인 내용 리뷰'의 비율을 추정해주세요.
      "summary": "전반적인 평가 요약 (100자 이내)",
      "size": "제품 사이즈에 관한 평가 (70자 이내)",
      "recommendation": "추천 대상 (70자 이내)"
    }
    
    다른 텍스트 없이 JSON 형식으로만 응답해주세요.
    `;

    console.log("Gemini API에 요청 보내는 중...");

    // Gemini API 호출
    const response = await axios.post(
      `${API_URL}?key=${apiKey}`,
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Gemini API 응답 받음");

    // API 응답에서 텍스트 추출
    const responseText = response.data.candidates[0].content.parts[0].text;
    console.log("API 응답 텍스트 길이:", responseText.length);
    console.log("응답 텍스트 일부:", responseText.substring(0, 200));

    // JSON 문자열 찾기 (Gemini가 추가 텍스트를 반환할 수 있음)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      console.log("JSON 형식 응답 발견");
      // JSON 파싱
      try {
        const jsonResult = JSON.parse(jsonMatch[0]);

        // 직접 전체 리뷰 개수를 추가
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
    } else {
      console.error("JSON 형식 응답을 찾을 수 없음");
      return {
        success: false,
        error: "API가 올바른 JSON 형식으로 응답하지 않았습니다.",
        raw_response: responseText,
      };
    }
  } catch (error) {
    console.error("Gemini API 요청 오류:", error.message);
    if (error.response) {
      console.error(
        "API 오류 응답:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    return {
      success: false,
      error: `API 요청 오류: ${error.message}`,
      details: error.response?.data || {},
    };
  }
}

module.exports = { analyzeReviews };
