const puppeteer = require("puppeteer");
const axios = require("axios");

// URL에서 goodsNo를 추출
function extractGoodsNo(url) {
  try {
    const match = url.match(/\/products\/(\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("goodsNo 추출 중 오류:", error.message);
    return null;
  }
}

// API를 통해 리뷰를 수집
async function fetchReviewsFromAPI(goodsNo) {
  console.log(`리뷰 수집 시작`);

  const allReviews = [];
  let page = 0;
  let hasMoreReviews = true;

  try {
    while (hasMoreReviews) {
      console.log(`페이지 ${page} 리뷰 요청 중...`);

      const response = await axios.get(
        `https://goods.musinsa.com/api2/review/v1/view/list`,
        {
          params: {
            page: page,
            pageSize: 10,
            goodsNo: goodsNo,
          },
          headers: {
            accept: "application/json, text/plain, */*",
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          timeout: 10000,
          withCredentials: true,
        }
      );

      // API 응답 구조
      if (response.data.data.list.length > 0) {
        const reviews = response.data.data.list.map((review) =>
          review.content?.trim()
        );

        allReviews.push(...reviews);
        console.log(`누적 리뷰 ${allReviews.length}개`);

        // 종료 조건
        const { totalPages } = response.data.data.page;
        if (page >= totalPages - 1) hasMoreReviews = false;
      } else {
        hasMoreReviews = false;
        console.log("더 이상 리뷰가 없습니다.");
      }

      page++;

      // API 호출 간격 (0.3초)
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    console.log(`리뷰 수집 완료: 총 ${allReviews.length}개`);

    return allReviews;
  } catch (error) {
    console.error("리뷰 수집 실패:", error.message);
    return [];
  }
}

async function crawlMusinsaReviews(url) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3",
    });

    await page.goto(url, { waitUntil: "networkidle2" });

    // 상품 정보 크롤링
    const productInfo = await page.evaluate((url) => {
      // 대표 이미지
      const image =
        document.querySelector('.sc-366fl4-3.cRHyEE img[alt="Thumbnail 0"]')
          ?.src || "";
      // 상품명
      const name =
        document
          .querySelector(
            ".text-title_18px_med.sc-1omefes-1.exqQRL.font-pretendard"
          )
          ?.textContent?.trim() || "";
      // 브랜드
      const brand =
        document
          .querySelector(
            '.sc-12cqkwk-2.hgzZM .text-body_14px_med.font-pretendard[data-mds="Typography"]'
          )
          ?.textContent?.trim() || "";
      // 가격
      const price =
        document
          .querySelector(
            ".text-title_18px_semi.sc-1hw5bl8-7.kXhdZT.text-black.font-pretendard"
          )
          ?.textContent?.trim() || "";

      return { name, brand, price, image, url };
    }, url);

    console.log("상품 정보 수집 완료:", productInfo);

    // URL에서 goodsNo 추출
    const goodsNo = extractGoodsNo(url);
    console.log("goodsNo:", goodsNo);

    // 리뷰 수집
    console.log("리뷰 수집을 시도합니다...");
    const apiReviews = await fetchReviewsFromAPI(goodsNo);

    if (apiReviews.length > 0) {
      console.log(`${apiReviews.length}개 리뷰 수집 완료`);
      return { product: productInfo, reviews: apiReviews };
    } else {
      console.log("리뷰를 가져올 수 없습니다.");
      return { product: productInfo, reviews: [] };
    }
  } catch (err) {
    console.error("무신사 리뷰 크롤링 에러:", err.message);
    return { product: {}, reviews: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = crawlMusinsaReviews;
