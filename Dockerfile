# Reloop — เว็บและตัวประมวลผลวิดีโอในคอนเทนเนอร์เดียว (ประหยัดค่าบริการ Render ไปหนึ่งตัว)
FROM node:22-bookworm-slim

# ffmpeg = ตัดต่อวิดีโอ | fonts-thai-tlwg = ฟอนต์ไทยสำหรับเบิร์นซับ | yt-dlp = ดึงไฟล์ต้นฉบับ
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl python3 fonts-thai-tlwg \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
