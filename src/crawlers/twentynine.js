const axios = require("axios");
const cheerio = require("cheerio");

function getProductId(url) {
  try {
    const match = url.match(/\/products\/(\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("Product ID extraction error:", error.message);
    return null;
  }
}

async function fetchProductInfo(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    // title에서 상품명 추출 (29cm는 "상품명 - 감도 깊은 취향 셀렉트샵 29CM" 형식)
    const fullTitle = $("title").text().trim();
    const productName = fullTitle
      .replace(" - 감도 깊은 취향 셀렉트샵 29CM", "")
      .trim();

    // 기본 셀렉터들도 시도
    const productNameFromId = $("#pdp_product_name").text().trim();
    const brandName = $("h3.flex.items-center span").text().trim();
    const productImage =
      $("img.h-full.w-full.object-cover").first().attr("src") ||
      $("img").first().attr("src") ||
      "";

    const finalProductName = productNameFromId || productName || "";

    const productInfo = {
      name: finalProductName,
      brand: brandName || "",
      image: productImage,
      url: url,
    };

    return productInfo;
  } catch (error) {
    console.error("Product info fetch failed:", error.message);
    return null;
  }
}

async function fetchReviews(itemId, url) {
  const allReviews = [];
  let page = 0;
  let hasMoreReviews = true;

  try {
    while (hasMoreReviews) {
      const response = await axios.get(
        `https://review-api.29cm.co.kr/api/v4/reviews`,
        {
          params: {
            itemId: itemId,
            page: page,
            size: 20,
            sort: "best",
          },
          headers: {
            accept: "*/*",
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
            "sec-ch-ua":
              '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
          },
          timeout: 10000,
        }
      );

      if (
        response.data.data?.results &&
        response.data.data.results.length > 0
      ) {
        const reviews = response.data.data.results
          .map((review) => review.contents?.trim())
          .filter((content) => content && content.length > 0);

        allReviews.push(...reviews);
        hasMoreReviews = response.data.data.next !== null;
      } else {
        hasMoreReviews = false;
      }

      page++;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return allReviews;
  } catch (error) {
    console.error("Review fetch failed:", error.message);
    return [];
  }
}

async function crawlTwentyNine(url) {
  try {
    const itemId = getProductId(url);
    if (!itemId) {
      return { product: {}, reviews: [] };
    }

    const [productInfo, reviews] = await Promise.all([
      fetchProductInfo(url),
      fetchReviews(itemId, url),
    ]);

    return {
      product: productInfo || { url: url },
      reviews: reviews,
    };
  } catch (err) {
    console.error("29cm crawl error:", err.message);
    return { product: {}, reviews: [] };
  }
}

module.exports = crawlTwentyNine;
