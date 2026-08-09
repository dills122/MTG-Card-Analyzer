FROM ubuntu:24.04@sha256:561618e2c15bf2397621dd04f96926663a3b5616c189cf7e38db7e82f5c538ea

# Official workflow and requirements:
# https://github.com/tesseract-ocr/tesstrain#installation
# https://github.com/tesseract-ocr/tesstrain#usage

ARG DEBIAN_FRONTEND=noninteractive
ARG TESSTRAIN_REVISION=405346a3a67d8e4e049341d1da6a4b752e0b8351
ARG LANGDATA_LSTM_REVISION=07930fd9f246622c26eb5de794d9212ceac432d3
ARG TESSDATA_BEST_REVISION=e12c65a915945e4c28e237a9b52bc4a8f39a0cec
ARG TESSDATA_BEST_ENG_SHA256=8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba

LABEL org.opencontainers.image.source="https://github.com/dills122/MTG-Card-Analyzer"
LABEL org.opencontainers.image.description="Pinned offline Tesseract fine-tuning environment"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        git \
        libtesseract-dev \
        make \
        python3 \
        python3-pil \
        tesseract-ocr \
        unzip \
        wget \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    git init /opt/tesstrain; \
    git -C /opt/tesstrain remote add origin https://github.com/tesseract-ocr/tesstrain.git; \
    git -C /opt/tesstrain fetch --depth 1 origin "${TESSTRAIN_REVISION}"; \
    git -C /opt/tesstrain checkout --detach FETCH_HEAD; \
    test "$(git -C /opt/tesstrain rev-parse HEAD)" = "${TESSTRAIN_REVISION}"

RUN set -eux; \
    mkdir -p /opt/tessdata_best; \
    wget --quiet \
        --output-document=/opt/tessdata_best/eng.traineddata \
        "https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/${TESSDATA_BEST_REVISION}/eng.traineddata"; \
    echo "${TESSDATA_BEST_ENG_SHA256}  /opt/tessdata_best/eng.traineddata" | sha256sum --check --strict

RUN set -eux; \
    mkdir -p /opt/langdata_lstm; \
    for file in \
        radical-stroke.txt \
        Arabic.unicharset Armenian.unicharset Bengali.unicharset Bopomofo.unicharset \
        Canadian_Aboriginal.unicharset Cherokee.unicharset Cyrillic.unicharset \
        Devanagari.unicharset Ethiopic.unicharset Georgian.unicharset Greek.unicharset \
        Gujarati.unicharset Gurmukhi.unicharset Hangul.unicharset Han.unicharset \
        Hebrew.unicharset Hiragana.unicharset Kannada.unicharset Katakana.unicharset \
        Khmer.unicharset Lao.unicharset Latin.unicharset Malayalam.unicharset \
        Myanmar.unicharset Ogham.unicharset Oriya.unicharset Runic.unicharset \
        Sinhala.unicharset Syriac.unicharset Tamil.unicharset Telugu.unicharset \
        Thai.unicharset; \
    do \
        wget --quiet \
            --output-document="/opt/langdata_lstm/${file}" \
            "https://raw.githubusercontent.com/tesseract-ocr/langdata_lstm/${LANGDATA_LSTM_REVISION}/${file}"; \
    done

RUN set -eux; \
    make --version; \
    tesseract --version; \
    lstmtraining --version; \
    combine_tessdata --version; \
    test -f /usr/share/tesseract-ocr/5/tessdata/configs/lstm.train

WORKDIR /opt/tesstrain
ENTRYPOINT ["make", "-C", "/opt/tesstrain"]
