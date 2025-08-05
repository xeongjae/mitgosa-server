const axios = require("axios");

// URL에서 goodsNo를 추출
function getGoodsNo(url) {
  try {
    const match = url.match(/\/products\/(\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("goodsNo extraction error:", error.message);
    return null;
  }
}

// API를 통해 리뷰를 수집
async function fetchReviews(goodsNo, url) {
  const allReviews = [];
  let page = 0;
  let hasMoreReviews = true;
  let productInfo = null;

  try {
    while (hasMoreReviews) {
      const response = await axios.get(
        `https://goods.musinsa.com/api2/review/v1/view/list`,
        {
          params: {
            page: page,
            pageSize: 10,
            goodsNo: goodsNo,
            sort: "up_cnt_desc",
            selectedSimilarNo: goodsNo,
            myFilter: false,
            hasPhoto: false,
            isExperience: false,
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
        if (productInfo === null && response.data.data.list[0].goods) {
          const goods = response.data.data.list[0].goods;
          productInfo = {
            name: goods.goodsName || "",
            brand: goods.brandName || "",
            image: goods.goodsImageFile
              ? `https://image.msscdn.net${goods.goodsImageFile.replace(
                  "_100.jpg",
                  "_500.jpg"
                )}`
              : "",
            url: url,
          };
        }

        const reviews = response.data.data.list.map((review) =>
          review.content?.trim()
        );

        allReviews.push(...reviews);

        // 종료 조건
        const { totalPages } = response.data.data.page;
        if (page >= totalPages - 1) {
          hasMoreReviews = false;
        }
      } else {
        hasMoreReviews = false;
      }

      page++;

      // API 호출 간격 (0.3초)
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return { reviews: allReviews, productInfo: productInfo };
  } catch (error) {
    console.error("Review fetch failed:", error.message);
    return { reviews: [], productInfo: null };
  }
}

async function crawlMusinsa(url) {
  let browser;
  try {
    const goodsNo = getGoodsNo(url);

    const { reviews, productInfo } = await fetchReviews(goodsNo, url);

    if (reviews.length > 0) {
      return { product: productInfo, reviews: reviews };
    } else {
      return { product: productInfo || {}, reviews: [] };
    }
  } catch (err) {
    console.error("Musinsa crawl error:", err.message);
    return { product: {}, reviews: [] };
  }
}

module.exports = crawlMusinsa;
