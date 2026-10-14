# Reloop — เว็บและตัวประมวลผลวิดีโอในคอนเทนเนอร์เดียว (ประหยัดค่าบริการ Render ไปหนึ่งตัว)
FROM node:22-bookworm-slim

# ffmpeg = ตัดต่อวิดีโอ | fonts-thai-tlwg = ฟอนต์ไทยสำหรับเบิร์นซับ | yt-dlp = ดึงไฟล์ต้นฉบับ
# ติดตั้ง yt-dlp พร้อม curl_cffi ใน venv แยก: TikTok ปฏิเสธคำขอที่ไม่ได้ปลอมตัวเป็นเบราว์เซอร์
# (ไฟล์ yt-dlp ตัวเดี่ยวจาก GitHub ไม่มี curl_cffi ทดสอบแล้วดึงคลิป TikTok ไม่ได้)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl python3 python3-venv fonts-thai-tlwg \
    && python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir "yt-dlp[default,curl-cffi]" \
    && ln -s /opt/ytdlp/bin/yt-dlp /usr/local/bin/yt-dlp \
    && /usr/local/bin/yt-dlp --list-impersonate-targets | grep curl_cffi | grep -vq unavailable \
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
