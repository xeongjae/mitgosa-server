const axios = require("axios");

function getProductId(url) {
  try {
    const match = url.match(/\/(\d+)$/);
    return match ? match[1] : null;
  } catch (error) {
    console.error("Product ID extraction error:", error.message);
    return null;
  }
}

async function fetchReviews(productId, url) {
  const allReviews = [];
  let skipCount = 0;
  const limitCount = 20;
  let hasMoreReviews = true;
  let productInfo = null;

  const graphqlQuery = {
    operationName: "GetNormalReviewFeedList",
    variables: {
      order: "BEST_SCORE_DESC",
      limit_count: limitCount,
      product_id: productId,
      skip_count: skipCount,
    },
    query: `query GetNormalReviewFeedList($product_id: ID!, $limit_count: Int, $skip_count: Int, $order: UxReviewListOrderType) {
      feed_list: ux_review_list(
        input: {product_id: $product_id, order: $order, pagination: {limit_count: $limit_count, skip_count: $skip_count}}
      ) {
        total_count
        item_list {
          id
          contents
          rating
          reviewer {
            body_text
            profile {
              nickname
            }
          }
          product_info {
            name
            image_url
            option_detail_list {
              name
              value
            }
          }
          attribute_list {
            question {
              label
              category
            }
            answer {
              label
            }
          }
        }
      }
    }`,
  };

  try {
    while (hasMoreReviews) {
      graphqlQuery.variables.skip_count = skipCount;

      const response = await axios.post(
        "https://api.zigzag.kr/api/2/graphql/batch/GetNormalReviewFeedList",
        [graphqlQuery],
        {
          headers: {
            accept: "*/*",
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "content-type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          },
          timeout: 10000,
        }
      );

      if (response.data && response.data[0]?.data?.feed_list) {
        const feedList = response.data[0].data.feed_list;

        // 첫 번째 요청에서 상품 정보 추출
        if (!productInfo && feedList.item_list.length > 0) {
          const firstItem = feedList.item_list[0];
          productInfo = {
            name: firstItem.product_info?.name || "",
            brand: "", // 지그재그는 브랜드 정보 없음
            image: firstItem.product_info?.image_url || "",
            url: url,
          };
        }

        const reviews = feedList.item_list
          .map((item) => item.contents?.trim())
          .filter((content) => content && content.length > 0);

        allReviews.push(...reviews);

        // 더 이상 리뷰가 없으면 종료
        if (feedList.item_list.length < limitCount) {
          hasMoreReviews = false;
        } else {
          skipCount += limitCount;
        }

        // 최대 100개 리뷰로 제한
        if (allReviews.length >= 100) {
          hasMoreReviews = false;
        }
      } else {
        hasMoreReviews = false;
      }
    }

    return {
      product: productInfo || {
        name: "상품명 없음",
        brand: "",
        image: "",
        url: url,
      },
      reviews: allReviews.slice(0, 100),
    };
  } catch (error) {
    console.error("지그재그 크롤링 에러:", error.message);
    throw new Error(`지그재그 크롤링 실패: ${error.message}`);
  }
}

async function crawlZigzag(url) {
  try {
    const productId = getProductId(url);
    if (!productId) {
      throw new Error("지그재그 상품 ID를 추출할 수 없습니다.");
    }

    const result = await fetchReviews(productId, url);

    if (!result.reviews || result.reviews.length === 0) {
      throw new Error("리뷰 데이터를 찾을 수 없습니다.");
    }

    return result;
  } catch (error) {
    console.error("지그재그 크롤러 에러:", error.message);
    throw error;
  }
}

module.exports = crawlZigzag;
