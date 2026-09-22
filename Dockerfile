FROM node:22-slim

# Nuclei: single Go binary, no Docker-in-Docker needed (unlike Strix,
# which needs its own sandbox and can't run in a managed container).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && curl -sL -o /tmp/nuclei.zip \
       https://github.com/projectdiscovery/nuclei/releases/download/v3.11.1/nuclei_3.11.1_linux_amd64.zip \
    && unzip -o /tmp/nuclei.zip -d /usr/local/bin \
    && chmod +x /usr/local/bin/nuclei \
    && rm /tmp/nuclei.zip \
    && nuclei -update-templates \
    && apt-get purge -y unzip curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Piper (offline neural TTS) + its Indonesian voice, baked in so donation
# narration never depends on Gemini's quota or the viewer's browser having
# any TTS voices installed (see src/services/piperTts.js).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -sL -o /tmp/piper.tar.gz \
       https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz \
    && tar -xzf /tmp/piper.tar.gz -C /opt \
    && rm /tmp/piper.tar.gz \
    && mkdir -p /opt/piper-voices/id_ID \
    && curl -sL -o /opt/piper-voices/id_ID/id_ID-news_tts-medium.onnx \
       https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx \
    && curl -sL -o /opt/piper-voices/id_ID/id_ID-news_tts-medium.onnx.json \
       https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx.json \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

CMD ["node", "src/index.js"]
