const DEFAULT_CONCURRENCY = 8;
const MAX_CONCURRENCY = 32;

async function seedCardNames({
    getCardNames,
    insertName,
    logger = console,
    concurrency = DEFAULT_CONCURRENCY
}) {
    const names = await getCardNames();
    if (!Array.isArray(names)) {
        throw new Error("Scryfall card-name response must be an array");
    }
    if (names.some((name) => typeof name !== "string" || !name.trim())) {
        throw new Error("Scryfall card names must be non-empty strings");
    }
    if (names.length === 0) {
        logger.log("No card names returned; nothing to seed.");
        return { inserted: 0 };
    }

    logger.log(`Seeding ${names.length} card names...`);
    const workerCount = Math.min(names.length, normalizeConcurrency(concurrency));
    let nextIndex = 0;
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < names.length) {
            const index = nextIndex;
            nextIndex += 1;
            await insertName(names[index]);
        }
    });
    await Promise.all(workers);
    logger.log(`Seeded ${names.length} card names.`);
    return { inserted: names.length };
}

function normalizeConcurrency(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return DEFAULT_CONCURRENCY;
    }
    return Math.min(parsed, MAX_CONCURRENCY);
}

export { seedCardNames };

export default seedCardNames;
