FROM node:22-slim AS builder
LABEL com.centurylinklabs.watchtower.enable="true"

WORKDIR /app


COPY package.json yarn.lock ./

RUN yarn install

COPY . .

ENV NEXT_PUBLIC_BACKEND_URI="https://api.lendoor.aichallenge.fun"
ENV NEXT_PUBLIC_GOOGLE_REDIRECT_URI="https://lendoor.aichallenge.fun/borrow"
ENV NEXT_PUBLIC_DYNAMIC_ENV_ID="7c0129ea-c276-419f-a158-a5ba44df52a3"

ARG NEXT_PUBLIC_OPENAI_API_KEY
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_CLIENT_SECRET
ENV NEXT_PUBLIC_OPENAI_API_KEY=${NEXT_PUBLIC_OPENAI_API_KEY}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_SECRET=${NEXT_PUBLIC_GOOGLE_CLIENT_SECRET}


# Build del frontend
RUN yarn build

# ---------- Runner ----------
FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*


COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 4501

CMD ["yarn", "start", "--port", "4501", "--hostname", "0.0.0.0"]