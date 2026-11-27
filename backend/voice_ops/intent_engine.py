import re
from typing import Any, Dict, List, Optional


# Match a single explicit action. Commands that contain multiple actions remain
# unknown so the UI can ask the user to choose one.
_INTENT_PATTERNS = {
    "SCAN_PRESCRIPTION": (
        r"\b(?:scan|read|upload)\s+(?:my\s+)?prescription\b",
        r"\bprescription\s+(?:scan|reader?)\b",
        r"(?:parchi|prescription)\s+(?:scan|padho|padh(?:o)?)",
        r"पर्ची\s*(?:स्कैन|पढ़(?:ो|ें)?)",
        r"प्रिस्क्रिप्शन\s*(?:स्कैन|पढ़(?:ो|ें)?)",
    ),
    "COMPARE_SALTS": (
        r"\bcompare\s+(?:the\s+)?(?:generic\s+)?salts?\b",
        r"\bsalt\s+comparison\b",
        r"\b(?:generic\s+)?salts?\s+compare\b",
        r"(?:salt|salts)\s+(?:compare|ki\s+tulna)",
        r"(?:generic\s+)?salts?\s+की\s+तुलना",
        r"सॉल्ट(?:्स)?\s+की\s+तुलना",
    ),
    "FIND_KENDRA": (
        r"\b(?:find|locate|show)\s+(?:the\s+)?(?:nearest\s+)?(?:jan\s+aushadhi\s+)?kendra\b",
        r"\bnearest\s+(?:jan\s+aushadhi\s+)?(?:store|kendra)\b",
        r"\bkendra\s+(?:nearby|near\s+me)\b",
        r"(?:kendra|dukaan)\s+(?:kahan|kaha|dhundo|dhoondo)",
        r"(?:find|show)\s+(?:me\s+)?(?:a\s+)?nearby\s+(?:store|kendra)",
        r"(?:नज़दीकी|नजदीकी|पास\s+का)\s*(?:जन\s*औषधि\s*)?केंद्र",
        r"केंद्र\s*(?:ढूँढो|ढूंढो|खोजो|कहाँ|कहां)",
    ),
    "RESERVE_TOKEN": (
        r"\b(?:reserve|book)\s+(?:a\s+)?(?:pickup\s+)?token\b",
        r"\btoken\s+(?:reserve|book|kar(?:o|na))\b",
        r"(?:reserve|book)\s+(?:a\s+)?token",
        r"टोकन\s*(?:बुक|आरक्षित)(?:\s+कर(?:ो|ना))?",
    ),
    "START_NAVIGATION": (
        r"\b(?:start|begin)\s+(?:the\s+)?navigation\b",
        r"\b(?:navigate|directions?)\s+(?:to|for)\s+(?:the\s+)?(?:jan\s+aushadhi\s+)?kendra\b",
        r"\bshow\s+(?:me\s+)?(?:the\s+)?route\s+to\s+(?:the\s+)?kendra\b",
        r"(?:navigation|route|rasta)\s+(?:shuru|dikhao|batao)",
        r"रास्ता\s*(?:दिखाओ|बताओ)",
        r"नेविगेशन\s*(?:शुरू|चालू)\s*(?:करो)?",
    ),
    "READ_AUDIO_GUIDE": (
        r"\b(?:read|play|start)\s+(?:the\s+)?audio\s+guide\b",
        r"\baudio\s+guide\s+(?:please|sunao|chalao|play)",
        r"(?:audio|guide)\s+(?:sunao|chalao|padho)",
        r"ऑडियो\s+गाइड\s*(?:सुनाओ|चलाओ|पढ़ो)",
    ),
}

_SUGGESTED_COMMANDS = [
    "Scan my prescription",
    "Compare generic salts",
    "Find the nearest Kendra",
    "Reserve a pickup token",
    "Start navigation to the Kendra",
    "Read the audio guide",
]

_AUDIO_RESPONSES = {
    "en-IN": {
        "SCAN_PRESCRIPTION": "Ready to scan a prescription. I will read its text only; this does not diagnose or classify anything.",
        "COMPARE_SALTS": "Opening the generic salt price comparison.",
        "FIND_KENDRA": "Finding a nearby Jan Aushadhi Kendra.",
        "RESERVE_TOKEN": "Opening the pickup token reservation.",
        "START_NAVIGATION": "Starting directions to the Kendra.",
        "READ_AUDIO_GUIDE": "Playing the audio guide.",
        "UNKNOWN_INTENT": "Sorry, I did not understand. Try one of the suggested commands.",
    },
    "hi-IN": {
        "SCAN_PRESCRIPTION": "पर्ची स्कैन करने के लिए तैयार हूँ। मैं केवल उस पर लिखा पाठ पढ़ूँगा; कोई निदान या वर्गीकरण नहीं करूँगा।",
        "COMPARE_SALTS": "जेनेरिक सॉल्ट की कीमतों की तुलना खोल रहा हूँ।",
        "FIND_KENDRA": "नज़दीकी जन औषधि केंद्र खोज रहा हूँ।",
        "RESERVE_TOKEN": "पिकअप टोकन आरक्षित करने का विकल्प खोल रहा हूँ।",
        "START_NAVIGATION": "केंद्र तक जाने का रास्ता शुरू कर रहा हूँ।",
        "READ_AUDIO_GUIDE": "ऑडियो गाइड चला रहा हूँ।",
        "UNKNOWN_INTENT": "माफ़ कीजिए, बात समझ नहीं आई। सुझाए गए आदेशों में से कोई एक कहें।",
    },
}


def _audio_text(
    intent: str,
    language: str,
    context_summary: Optional[Dict[str, Any]],
) -> str:
    text = _AUDIO_RESPONSES[language][intent]
    context = context_summary or {}
    details: List[str] = []
    savings = context.get("savings_inr")
    if savings is not None:
        details.append(
            f"savings so far are ₹{savings:g}"
            if language == "en-IN"
            else f"अब तक की बचत ₹{savings:g} है"
        )
    nearest = context.get("nearest_kendra")
    if nearest:
        details.append(
            f"nearest Kendra is {nearest}"
            if language == "en-IN"
            else f"नज़दीकी केंद्र {nearest} है"
        )
    count = context.get("medicine_count")
    if count is not None:
        details.append(
            f"{count} medicines in the list"
            if language == "en-IN"
            else f"सूची में {count} दवाइयाँ हैं"
        )
    if details:
        text += (" Context: " if language == "en-IN" else " जानकारी: ") + "; ".join(details) + "."
    return text


def interpret_intent(
    transcript: str,
    language: str,
    context_summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized = " ".join((transcript or "").casefold().split())
    matched = [
        intent
        for intent, patterns in _INTENT_PATTERNS.items()
        if any(re.search(pattern, normalized, re.IGNORECASE) for pattern in patterns)
    ]
    if len(matched) != 1:
        return {
            "intent": "UNKNOWN_INTENT",
            "confidence": 0.0,
            "audio_text": _audio_text("UNKNOWN_INTENT", language, context_summary),
            "suggested_commands": list(_SUGGESTED_COMMANDS),
        }

    intent = matched[0]
    return {
        "intent": intent,
        "confidence": 0.96,
        "audio_text": _audio_text(intent, language, context_summary),
    }
