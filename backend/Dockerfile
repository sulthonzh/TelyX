# Build stage
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o telyx-backend .

# Run stage
FROM alpine:3.20
RUN adduser -D -u 1000 appuser
WORKDIR /app
COPY --from=builder /app/telyx-backend .
USER appuser
EXPOSE 8080
CMD ["./telyx-backend"]
