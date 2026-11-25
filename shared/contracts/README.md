# Shared API contracts

`openapi.yaml` is the contract between the frontend and the backend. Change it in the same pull request as the endpoint it describes.

## Frontend integration notes

- Base path: `/api/v1`. Every JSON response is `{ success, data }` or `{ success: false, error: { code, message, details? } }`.
- Send requests with `credentials: "include"`. The backend sets `access_token` and `refresh_token` as HTTP-only cookies.
- On every POST, PATCH and DELETE, read the `csrf_token` cookie and send it as the `X-CSRF-Token` header. Without it the API returns 403 with code `CSRF_FAILED`.
- On a 401, call `POST /api/v1/auth/refresh` once (with the CSRF header). If that also returns 401, send the user to login.
- `FRONTEND_URL` on the backend must list the frontend origin, or CORS blocks the request. Use a comma-separated list for several origins.
- For a frontend on another site, the backend needs `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`, served over HTTPS.
- Upload datasets as `multipart/form-data` with the file in a field named `file`.
- `POST /api/v1/analysis` returns the finished record. Check `status`: `COMPLETED` has results, `FAILED` has `errorMessage`.
- `interpretation` can be null even when `status` is `COMPLETED`. Show the statistics and the limitations in that case.
- Render charts from `visualizationData.type`: `histogram`, `bar`, `groupSummary`, `heatmap` or `scatter`.
- Download report PDFs from `downloadPath` with credentials. There are no public file URLs.
