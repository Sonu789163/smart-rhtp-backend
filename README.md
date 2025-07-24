# Smart DRHP Backend

This is the backend for the Smart DRHP Document Assistant platform. It provides RESTful APIs for document upload, management, AI-powered summarization, and chat functionality, with secure authentication and user management.

## Features

- User authentication (email/password & Microsoft OAuth)
- Upload, download, and manage PDF documents (stored in Cloudflare R2, S3-compatible)
- Generate and manage AI-powered document summaries
- Chat with your documents to extract insights
- User-specific data isolation and security

## API Endpoints

### Auth

- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Login with email/password
- `POST /api/auth/refresh-token` — Refresh JWT access token
- `POST /api/auth/logout` — Logout and invalidate refresh token
- `GET /api/auth/microsoft` — Microsoft OAuth login URL
- `GET /api/auth/callback` — Microsoft OAuth callback
- `GET /api/auth/me` — Get current user info
- `GET /api/auth/history` — Get user's documents, summaries, and chats

### Documents

- `GET /api/documents/` — List all documents for the user
- `GET /api/documents/:id` — Get a single document
- `POST /api/documents/` — Create a document record
- `POST /api/documents/upload` — Upload a PDF file
- `GET /api/documents/download/:id` — Download/view a PDF file
- `PUT /api/documents/:id` — Update document metadata
- `DELETE /api/documents/:id` — Delete a document

### Summaries

- `GET /api/summaries/` — List all summaries for the user
- `GET /api/summaries/document/:documentId` — Get summaries for a document
- `POST /api/summaries/` — Create a new summary
- `PUT /api/summaries/:id` — Update a summary
- `DELETE /api/summaries/:id` — Delete a summary

### Chats

- `GET /api/chats/` — List all chats for the user
- `GET /api/chats/document/:documentId` — Get chat history for a document
- `POST /api/chats/` — Create a new chat
- `POST /api/chats/:chatId/messages` — Add a message to a chat
- `PUT /api/chats/:id` — Update a chat
- `DELETE /api/chats/:id` — Delete a chat

## Data Models

- **User**: Microsoft or email/password, with refresh tokens
- **Document**: PDF file (stored in Cloudflare R2), metadata, user association
- **Summary**: AI-generated summary, linked to document and user
- **Chat**: Conversation history, linked to document and user

## Tech Stack

- Node.js, Express, TypeScript
- MongoDB
- Cloudflare R2 (S3-compatible object storage) for file storage
- Passport.js (Microsoft OAuth)
- JWT authentication
- Multer (file uploads, via multer-s3)
- AWS SDK v3 for S3
- Axios, FormData

## Setup

1. Install dependencies: `npm install`
2. Set environment variables in `.env` (see below)
3. Start in dev mode: `npm run dev`
4. Build: `npm run build` (output in `dist/`)
5. Start production: `npm start`

### Example .env

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/smart-rhp
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
CLIENT_ID=your_microsoft_client_id
CLIENT_SECRET=your_microsoft_client_secret
REDIRECT_URI=https://smart-rhtp-backend-2.onrender.com/api/auth/callback
FRONTEND_URL=https://rhp-document-summarizer.vercel.app/

# Cloudflare R2 (S3-compatible) configuration
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_r2_bucket_name
CLOUDFLARE_URI=https://<accountid>.<region>.r2.cloudflarestorage.com
```

## Password Reset

- `POST /api/auth/forgot-password` — Request a password reset (email/password users only)
  - Body: `{ email: string }`
  - Always returns success message for privacy.
- `POST /api/auth/reset-password` — Reset password with token (email/password users only)
  - Body: `{ email: string, token: string, password: string }`
  - Returns success or error if token is invalid/expired.
- **Microsoft users:** Please reset your password using your Microsoft account provider. This backend does not handle Microsoft password resets.

## License

MIT
