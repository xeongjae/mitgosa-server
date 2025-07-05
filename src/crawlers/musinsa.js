const puppeteer = require("puppeteer");

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

    // 상품 정보 크롤링 (리뷰 전체보기 버튼 누르기 전)
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

    await page.waitForSelector(".review-list-item__Container-sc-13zantg-0", {
      timeout: 30000,
    });

    // 전체 보기 버튼 확인 및 클릭
    try {
      console.log("리뷰 전체보기 버튼을 찾는 중...");

      const moreButtonClicked = await page.evaluate(() => {
        // "후기 전체보기" 텍스트를 포함한 span 찾기
        const xpath1 = "//span[contains(text(), '후기 전체보기')]";
        const result1 = document.evaluate(
          xpath1,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        let spanElement = result1.singleNodeValue;

        if (spanElement) {
          console.log(
            `리뷰 전체보기 span 찾음: "${spanElement.textContent.trim()}"`
          );

          // span의 부모 버튼 찾기
          const parentButton = spanElement.closest("button");

          if (parentButton) {
            console.log("부모 버튼을 클릭합니다.");
            parentButton.click();
            return true;
          } else {
            console.log("span 자체를 클릭합니다.");
            spanElement.click();
            return true;
          }
        }

        console.log("리뷰 전체보기 버튼을 찾을 수 없습니다.");
        return false;
      });

      if (moreButtonClicked) {
        console.log("리뷰 전체보기 버튼 클릭 완료!");

        // 버튼 클릭 후 새 탭이 열리는지 확인
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const pages = await browser.pages();
        console.log(`현재 열린 페이지 수: ${pages.length}`);

        let targetPage = page; // 기본값은 원래 페이지

        if (pages.length > 2) {
          // 새 탭이 열렸다면 그 탭으로 이동
          targetPage = pages[pages.length - 1]; // 가장 최근에 열린 페이지
          console.log("새로운 탭이 열렸습니다. 새 탭으로 이동합니다.");
          await targetPage.bringToFront();

          // 새 페이지에서 리뷰 컨테이너가 로드될 때까지 대기
          await targetPage.waitForSelector(
            ".review-list-item__Container-sc-13zantg-0",
            {
              timeout: 30000,
            }
          );

          // 무한스크롤로 모든 리뷰 로딩
          console.log("무한스크롤로 모든 리뷰를 로딩 중...");
          const scrolledReviews = await loadAllReviewsByScroll(targetPage);

          // 스크롤 과정에서 수집된 리뷰가 있다면 사용
          if (scrolledReviews && scrolledReviews.length > 0) {
            console.log(
              `스크롤 과정에서 수집된 리뷰: ${scrolledReviews.length}개`
            );
            return { product: productInfo, reviews: scrolledReviews };
          }
        } else {
          // 같은 페이지에서 내용이 바뀌었는지 확인
          console.log("같은 페이지에서 내용 변화를 확인합니다.");

          // URL이 변경되었는지 확인
          const currentUrl = await page.url();
          console.log(`현재 URL: ${currentUrl}`);

          if (currentUrl !== url) {
            console.log("페이지 URL이 변경되었습니다.");
            // URL이 바뀌었다면 무한스크롤 시도
            console.log("무한스크롤로 모든 리뷰를 로딩 중...");
            const scrolledReviews = await loadAllReviewsByScroll(targetPage);

            // 스크롤 과정에서 수집된 리뷰가 있다면 사용
            if (scrolledReviews && scrolledReviews.length > 0) {
              console.log(
                `스크롤 과정에서 수집된 리뷰: ${scrolledReviews.length}개`
              );
              return { product: productInfo, reviews: scrolledReviews };
            }
          }
        }

        // 타겟 페이지에서 리뷰 추출
        const reviewContents = await targetPage.evaluate(() => {
          const allReviews = Array.from(
            document.querySelectorAll(
              ".review-list-item__Container-sc-13zantg-0"
            )
          );

          console.log(`총 ${allReviews.length}개의 리뷰 발견`);

          const reviewData = allReviews
            .map((item, index) => {
              const textElement = item.querySelector(
                "span.text-body_13px_reg.text-black.font-pretendard"
              );

              if (textElement && textElement.textContent.trim().length > 10) {
                return textElement.textContent.trim();
              }

              return null;
            })
            .filter((review) => review !== null);

          console.log(`🎉 추출 완료: ${reviewData.length}개의 리뷰`);
          return reviewData;
        });

        console.log(`최종 수집 완료: ${reviewContents.length}개의 리뷰`);
        return { product: productInfo, reviews: reviewContents };
      } else {
        console.log("전체보기 버튼 없음");
      }
    } catch (error) {
      console.log("전체보기 버튼 처리 오류:", error.message);
    }

    // 전체보기 버튼이 없거나 실패한 경우 원래 페이지에서 리뷰 추출
    const reviewContents = await page.evaluate(() => {
      const allReviews = Array.from(
        document.querySelectorAll(".review-list-item__Container-sc-13zantg-0")
      );

      console.log(`총 ${allReviews.length}개의 리뷰 발견`);

      const reviewData = allReviews
        .map((item, index) => {
          const textElement = item.querySelector(
            "span.text-body_13px_reg.text-black.font-pretendard"
          );

          if (textElement && textElement.textContent.trim().length > 10) {
            return textElement.textContent.trim();
          }

          return null;
        })
        .filter((review) => review !== null);

      console.log(`🎉 추출 완료: ${reviewData.length}개의 리뷰`);
      return reviewData;
    });

    console.log(`최종 수집 완료: ${reviewContents.length}개의 리뷰`);
    return { product: productInfo, reviews: reviewContents };
  } catch (err) {
    console.error("무신사 리뷰 크롤링 에러:", err.message);
    return { product: productInfo, reviews: [] };
  } finally {
    if (browser) await browser.close();
  }
}

// 무한스크롤로 모든 리뷰 로딩하는 함수 (가상 스크롤링 대응)
async function loadAllReviewsByScroll(page) {
  let scrollAttempts = 0;
  const maxScrollAttempts = 200; // 최대 200번 스크롤 시도
  let stableCount = 0; // 연속으로 새 리뷰가 없는 횟수

  // 수집된 리뷰를 저장할 Set (중복 제거용)
  const collectedReviews = new Set();
  let lastCollectedCount = 0;

  console.log("리뷰 수집 시작");

  while (scrollAttempts < maxScrollAttempts) {
    // 현재 DOM에 있는 모든 리뷰 수집
    const currentReviews = await page.evaluate(() => {
      const allReviews = Array.from(
        document.querySelectorAll(".review-list-item__Container-sc-13zantg-0")
      );

      return allReviews
        .map((item, index) => {
          const textElement = item.querySelector(
            "span.text-body_13px_reg.text-black.font-pretendard"
          );

          if (textElement && textElement.textContent.trim().length > 10) {
            return textElement.textContent.trim();
          }
          return null;
        })
        .filter((review) => review !== null);
    });

    // 새로 발견된 리뷰들을 Set에 추가 (자동 중복 제거)
    let newReviewsAdded = 0;
    currentReviews.forEach((review) => {
      if (!collectedReviews.has(review)) {
        collectedReviews.add(review);
        newReviewsAdded++;
      }
    });

    console.log(
      `스크롤 ${scrollAttempts + 1}: DOM ${
        currentReviews.length
      }개, 신규 ${newReviewsAdded}개, 총 ${collectedReviews.size}개`
    );

    // 새로운 리뷰가 추가되었는지 확인
    if (collectedReviews.size > lastCollectedCount) {
      lastCollectedCount = collectedReviews.size;
      stableCount = 0; // 새 리뷰가 있으니 stable 카운트 리셋
    } else {
      stableCount++;

      // 3번 연속 새 리뷰가 없으면 수집 완료로 판단 (5번 → 3번으로 더 강화!)
      if (stableCount >= 3) {
        console.log("수집 완료 (3번 연속 새 리뷰 없음)");
        break;
      }
    }

    // 스크롤 실행
    try {
      // 방법 1: END키 (25% 비중)
      if (scrollAttempts % 4 === 0) {
        await page.keyboard.press("End");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // 방법 2: PAGE_DOWN 연발 (75% 비중)
      else {
        // 한번에 6번 연속 PAGE_DOWN (4번 → 6번)
        for (let i = 0; i < 6; i++) {
          await page.keyboard.press("PageDown");
          await new Promise((resolve) => setTimeout(resolve, 30)); // 50ms → 30ms
        }

        // 새 리뷰가 없으면 바로 END키 추가
        if (stableCount >= 1) {
          await page.keyboard.press("End");
        }
      }
    } catch (keyError) {
      console.log("키보드 오류, 폴백 사용");
      await page.evaluate(() => {
        window.scrollBy(0, 8000); // 5000 → 8000
        window.scrollTo(0, document.body.scrollHeight);
      });
    }

    // 최소 대기시간
    const waitTime = stableCount >= 1 ? 50 : 100; // 100/200ms → 50/100ms
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    scrollAttempts++;

    // 진행상황 출력
    if (scrollAttempts % 20 === 0) {
      // 5번 → 20번마다 출력 (로그 줄이기)
      console.log(
        `진행: ${scrollAttempts}/${maxScrollAttempts}, 수집: ${collectedReviews.size}개`
      );
    }
  }

  if (scrollAttempts >= maxScrollAttempts) {
    console.log("최대 스크롤 횟수 도달");
  }

  console.log(`최종 수집: ${collectedReviews.size}개`);

  // Set을 Array로 변환하여 반환
  return Array.from(collectedReviews);
}

module.exports = crawlMusinsaReviews;
