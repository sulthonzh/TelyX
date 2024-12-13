FROM golang:1.20
WORKDIR /app
COPY . .
RUN go build -o main .
CMD ["./main"]
EXPOSE 8080
