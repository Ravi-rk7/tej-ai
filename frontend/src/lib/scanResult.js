const DEFAULT_SAFETY = Object.freeze({
    patchTest: "Patch-test every new product before using it on your full face.",
    spf: "Use broad-spectrum SPF 30+ every morning, even on cloudy days.",
    cautions: "If pregnant, breastfeeding, managing allergies or sensitive skin, or taking medication, check with a qualified clinician before starting new actives.",
    disclaimer: "This is cosmetic wellness guidance, not a medical diagnosis or treatment plan.",
    dermatologist: null,
});

const isScore = (value) => Number.isInteger(value) && value >= 0 && value <= 100;

const normalizeStep = (step) => {
    if (typeof step === "string" && step.trim()) {
        return { name: step.trim(), instructions: "" };
    }

    if (!step || typeof step !== "object") return null;
    const name = step.name ?? step.title;
    const instructions = step.instructions ?? step.description ?? "";
    if (typeof name !== "string" || !name.trim()) return null;
    return {
        name: name.trim(),
        instructions: typeof instructions === "string" ? instructions.trim() : "",
    };
};

const normalizeSteps = (steps) => (Array.isArray(steps)
    ? steps.map(normalizeStep).filter(Boolean).slice(0, 4)
    : []);

const normalizeRoutine = (routine) => {
    if (Array.isArray(routine)) {
        return {
            schemaVersion: 1,
            source: "legacy",
            morning: normalizeSteps(routine),
            night: [],
            safety: { ...DEFAULT_SAFETY },
        };
    }

    if (!routine || typeof routine !== "object") return null;
    const morning = normalizeSteps(routine.morning);
    const night = normalizeSteps(routine.night);
    if (morning.length === 0 && night.length === 0) return null;

    return {
        schemaVersion: routine.schemaVersion ?? 1,
        source: routine.source ?? "legacy",
        morning,
        night,
        safety: { ...DEFAULT_SAFETY, ...(routine.safety || {}) },
    };
};

const normalizeConcern = (concern) => {
    if (typeof concern === "string" && concern.trim()) {
        return { key: concern.toLowerCase().replace(/\s+/g, "_"), label: concern.trim(), score: null, severity: null };
    }
    if (!concern || typeof concern !== "object" || typeof concern.label !== "string") return null;
    return {
        key: typeof concern.key === "string" ? concern.key : concern.label.toLowerCase().replace(/\s+/g, "_"),
        label: concern.label,
        score: isScore(concern.score) ? concern.score : null,
        severity: ["mild", "moderate", "severe"].includes(concern.severity) ? concern.severity : null,
    };
};

const normalizeWarning = (warning) => {
    if (typeof warning === "string" && warning.trim()) {
        return { code: warning.trim(), message: warning.trim() };
    }
    if (!warning || typeof warning !== "object") return null;
    if (typeof warning.message !== "string" || !warning.message.trim()) return null;
    return {
        code: typeof warning.code === "string" && warning.code.trim() ? warning.code.trim() : "RESULT_WARNING",
        message: warning.message.trim(),
    };
};

export const normalizeScanResult = (result) => {
    if (!result || typeof result !== "object") return null;

    const glowScore = result.glowScore;
    const concernDetails = Array.isArray(result.concernDetails)
        ? result.concernDetails.map(normalizeConcern).filter(Boolean)
        : [];
    const concerns = concernDetails.length > 0
        ? concernDetails
        : (Array.isArray(result.concerns) ? result.concerns.map(normalizeConcern).filter(Boolean) : []);
    const warnings = [
        ...(Array.isArray(result.warnings) ? result.warnings : []),
        ...(typeof result.imageGuidance === "string" ? [{ code: "FACE_SIZE_BELOW_RECOMMENDATION", message: result.imageGuidance }] : []),
    ].map(normalizeWarning).filter(Boolean).filter((warning, index, list) => (
        list.findIndex((candidate) => candidate.code === warning.code) === index
    ));

    return {
        valid: isScore(glowScore),
        scanId: typeof result.scanId === "string" ? result.scanId : null,
        createdAt: result.createdAt ?? null,
        glowScore: isScore(glowScore) ? glowScore : null,
        skinType: typeof result.skinType === "string" && result.skinType.trim() ? result.skinType : "Unknown",
        concerns,
        metrics: result.metrics && typeof result.metrics === "object" ? result.metrics : null,
        routine: normalizeRoutine(result.routine),
        imageGuidance: typeof result.imageGuidance === "string" ? result.imageGuidance : null,
        warnings,
    };
};

export { DEFAULT_SAFETY, isScore, normalizeRoutine, normalizeStep, normalizeWarning };
