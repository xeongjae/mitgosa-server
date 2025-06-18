# 리뷰스캔 서버

이 프로젝트는 무신사 제품 페이지에서 리뷰를 크롤링하고 Google Gemini API를 사용하여 리뷰를 분석하는 서버입니다.

## 설치 방법

1. 저장소 클론

```
git clone [저장소 URL]
cd reviewscan-server
```

2. 의존성 설치

```
npm install
```

3. `.env` 파일 생성
   프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음 내용을 추가합니다:

```
GEMINI_API_KEY=여기에_API_키_입력
```

## Gemini API 키 발급 받기

1. Google AI Studio (https://ai.google.dev/) 접속
2. Google 계정으로 로그인
3. 'Get API key' 버튼 클릭
4. 새 API 키 생성 또는 기존 키 확인
5. 생성된 API 키를 복사하여 `.env` 파일의 `GEMINI_API_KEY` 값으로 설정

## 서버 실행

```
npm start
```

서버는 기본적으로 포트 4000에서 실행됩니다.

## API 엔드포인트

### 리뷰 크롤링

**요청:**

```
POST /api/review
Content-Type: application/json

{
  "url": "무신사 제품 URL"
}
```

**응답:**

```json
{
  "success": true,
  "message": ["리뷰1", "리뷰2", "리뷰3", ...]
}
```

### 리뷰 분석

**요청:**

```
POST /api/analyze
Content-Type: application/json

{
  "url": "무신사 제품 URL"
}
```

**응답:**

```json
{
  "success": true,
  "data": {
    "pros": ["장점1", "장점2", "장점3"],
    "cons": ["단점1", "단점2", "단점3"],
    "overall_rating": "5점 만점에 X점",
    "summary": "전반적인 평가 요약",
    "recommendation": "추천 대상"
  }
}
```

## 의존성 패키지

- express: 웹 서버 프레임워크
- puppeteer: 웹 크롤링 라이브러리
- axios: HTTP 클라이언트
- dotenv: 환경 변수 관리
- cors: CORS 미들웨어
