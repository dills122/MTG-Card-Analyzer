CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    image_key TEXT NOT NULL UNIQUE,
    image_type TEXT NOT NULL
        CHECK (image_type IN ('image/jpeg', 'image/png', 'image/webp')),
    image_size INTEGER NOT NULL
        CHECK (image_size > 0 AND image_size <= 10485760),
    original_filename TEXT NOT NULL,
    card_name TEXT NOT NULL,
    set_code TEXT NOT NULL,
    set_name TEXT NOT NULL,
    collector_number TEXT NOT NULL,
    type_line TEXT NOT NULL,
    rarity TEXT NOT NULL
        CHECK (rarity IN ('common', 'uncommon', 'rare', 'mythic', 'special', 'bonus')),
    quality TEXT NOT NULL
        CHECK (
            quality IN (
                'clean-scan',
                'good-photo',
                'average-photo',
                'poor-lighting',
                'blur',
                'rotation',
                'cropping',
                'low-resolution'
            )
        ),
    source_mode TEXT NOT NULL
        CHECK (source_mode IN ('manual', 'scryfall')),
    scryfall_id TEXT,
    scryfall_uri TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    review_notes TEXT
);

CREATE INDEX IF NOT EXISTS submissions_review_queue
    ON submissions (status, created_at);

CREATE INDEX IF NOT EXISTS submissions_card_print
    ON submissions (card_name, set_code, collector_number);
