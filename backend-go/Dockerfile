FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN go build -o /out/vimob-chatbot-backend ./cmd/api

FROM alpine:3.20

WORKDIR /app

RUN adduser -D -H -u 10001 appuser
COPY --from=build /out/vimob-chatbot-backend /usr/local/bin/vimob-chatbot-backend

ENV VIMOB_BACKEND_ADDR=:8088
EXPOSE 8088

USER appuser
CMD ["vimob-chatbot-backend"]
