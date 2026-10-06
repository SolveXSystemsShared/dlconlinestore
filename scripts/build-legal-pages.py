#!/usr/bin/env python3
"""
Builds public/privacy.html, public/terms.html and public/cookies.html.

The three legal pages share one shell (head, nav, footer) and one set of
company details, so they are generated rather than hand-edited. Edit COMPANY
below (or the section text) and run:

    python3 scripts/build-legal-pages.py

Any COMPANY value left as None renders as a highlighted "to confirm" marker on
the page, so an unfinished detail can never pass for a real one.

Wording follows the DLC compliance glossary: credits (never currency),
exchange / exchange request (never sale, purchase or order), settle (never pay).

These pages are a considered draft, not legal advice. Have them reviewed by a
South African attorney before launch.
"""
import re
from html import escape
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"
SITE = "https://dlconlinestore-8qpm.vercel.app"
UPDATED = "29 September 2026"

# Versions come from lib/legal.ts — the same values the server records when a
# member accepts — so the page and the evidence can never disagree.
_LEGAL_TS = (PUBLIC.parent / "lib" / "legal.ts").read_text(encoding="utf-8")
VERSIONS = {
    "terms": re.search(r'TERMS_VERSION = "([^"]+)"', _LEGAL_TS).group(1),
    "privacy": re.search(r'PRIVACY_VERSION = "([^"]+)"', _LEGAL_TS).group(1),
}

# ── Company details (ECTA s43, POPIA s18) ────────────────────────────────────
# Fill these in. None = shown on the page as a highlighted placeholder.
COMPANY = {
    "registered_name": None,          # e.g. "Down Low Holdings (Pty) Ltd"
    "legal_status": None,             # e.g. "private company" / "non-profit company" / "voluntary association"
    "registration_number": None,      # CIPC registration number
    "trading_name": "Down Low Cannabis (DLC)",
    "physical_address": "Unit B12, Leogem Innovation Worx Business Park, 1 Scale End, Halfway House Estate, Midrand, 1685",
    "area": "Gauteng, South Africa",
    "phone": "+27 64 555 2612",
    "email": "cam@solvex.web.co.za",
    "office_bearers": "Cameron Roberts (lead director) and Miguel De Gouveia (director)",
    "information_officer": "Cameron Roberts",
    "information_officer_email": "cam@solvex.web.co.za",
    "regulator_registration": None,   # Information Regulator registration reference
    "paia_manual_url": None,          # link to the PAIA manual, if published online
    "data_region": None,              # where Supabase stores member data, e.g. "the EU (Frankfurt)"
    "retention_years": None,          # how long membership records are kept after membership ends
}


def v(key, label=None):
    """A company detail, or a highlighted placeholder when not yet supplied."""
    value = COMPANY.get(key)
    if value:
        return escape(value)
    return f'<mark class="legal-todo">[{escape(label or key.replace("_", " "))} — to confirm]</mark>'


def mail(key, label):
    value = COMPANY.get(key)
    return f'<a href="mailto:{escape(value)}">{escape(value)}</a>' if value else v(key, label)


NAV = (
    '<a href="index.html?home=1">LOUNGE</a><a href="strains.html?category=flower">FLOWER</a>'
    '<a href="strains.html?category=prerolls">PREROLLS</a><a href="strains.html?category=wellness&amp;tier=wellness">WELLNESS</a>'
    '<a data-global-collection="more" href="strains.html?category=more">MORE</a>'
    '<a href="packages.html">PACKAGES</a><a href="specials.html">SPECIALS</a>'
)


def page(slug, title, h1, description, intro, sections, extra_head=""):
    version = f" · Version {VERSIONS[slug]}" if slug in VERSIONS else ""
    legal_links = [("privacy.html", "PRIVACY"), ("terms.html", "TERMS"), ("cookies.html", "COOKIES")]
    lounge_links = '<a href="packages.html">PACKAGES</a><a href="specials.html">SPECIALS</a><a href="referrals.html">REFERRALS</a>'
    footer_links = lounge_links + "".join(
        f'<a href="{href}"{" aria-current=\"page\"" if href == f"{slug}.html" else ""}>{label}</a>' for href, label in legal_links
    ) + '<a href="#cookie-settings" data-cookie-settings>COOKIE SETTINGS</a>'
    toc = "".join(f'<li><a href="#{sid}">{escape(head)}</a></li>' for sid, head, _ in sections)
    body = "\n".join(f'  <section id="{sid}"><h2>{escape(head)}</h2>{html}</section>' for sid, head, html in sections)
    return f"""<!doctype html>
<html lang="en-ZA">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#41a8fc">
  <title>{escape(title)} | Down Low Cannabis</title>
  <meta name="description" content="{escape(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="{SITE}/{slug}.html">
  <link rel="stylesheet" href="styles.css">
  <script src="cookies.js"></script>
  <script src="page-loader.js" data-context="page"></script>
  <link rel="icon" href="assets/dlc-logo.svg" type="image/svg+xml">
  <link rel="icon" href="assets/icons/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="assets/icons/icon-192.png">
  <link rel="manifest" href="site.webmanifest">
  <meta property="og:type" content="website"><meta property="og:title" content="{escape(title)} | Down Low Cannabis"><meta property="og:description" content="{escape(description)}"><meta property="og:url" content="{SITE}/{slug}.html"><meta property="og:image" content="{SITE}/assets/social/og-dlc.jpg">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{escape(title)} | Down Low Cannabis"><meta name="twitter:description" content="{escape(description)}"><meta name="twitter:image" content="{SITE}/assets/social/og-dlc.jpg">{extra_head}
</head>
<body class="legal-body">
<a class="skip-link" href="#main-content">Skip to main content</a>
<header class="nav">
  <a class="brand" href="index.html?home=1" aria-label="Down Low Cannabis home"><img class="brand-logo" src="assets/dlc-logo.svg" alt="Down Low Cannabis logo" width="52" height="52"></a>
  <nav class="nav-links" aria-label="Primary navigation">{NAV}</nav>
  <div class="nav-actions"><span class="age-pill">18+</span><button class="menu-btn" id="menuBtn" type="button" aria-label="Open menu">MENU</button></div>
</header>
<main id="main-content" class="legal-page"><div class="legal-page__inner">
  <div class="legal-page__kicker">DOWN LOW CANNABIS · LEGAL</div><h1>{h1}</h1>
  <p class="legal-page__updated">Last updated: {UPDATED}{version}</p>
  <p class="legal-page__intro">{intro}</p>
  <nav class="legal-toc" aria-label="On this page"><p>ON THIS PAGE</p><ol>{toc}</ol></nav>
{body}
</div></main>
<footer class="site-footer"><div class="site-footer__brand"><img src="assets/dlc-logo.svg" alt="" width="52" height="52"><span>DOWN LOW CANNABIS</span></div><nav aria-label="Footer">{footer_links}</nav><p>18+ · Halfway House, Midrand</p></footer>
<script src="common.js" defer></script>
</body></html>
"""


def contact_card():
    return f"""<div class="legal-card">
  <dl>
    <div><dt>Operated by</dt><dd>{v("registered_name", "registered name")}, trading as {v("trading_name")}</dd></div>
    <div><dt>Legal status</dt><dd>{v("legal_status", "legal status")}</dd></div>
    <div><dt>Registration number</dt><dd>{v("registration_number", "CIPC registration number")}</dd></div>
    <div><dt>Physical address</dt><dd>{v("physical_address", "physical address for legal notices")}<br>{v("area")}</dd></div>
    <div><dt>Telephone</dt><dd>{v("phone", "telephone number")}</dd></div>
    <div><dt>Email</dt><dd>{mail("email", "contact email")}</dd></div>
    <div><dt>Directors / office bearers</dt><dd>{v("office_bearers", "directors or office bearers")}</dd></div>
    <div><dt>Information Officer (POPIA)</dt><dd>{v("information_officer", "Information Officer")} · {mail("information_officer_email", "Information Officer email")}</dd></div>
    <div><dt>Website</dt><dd><a href="{SITE}/">{SITE.replace("https://", "")}</a></dd></div>
  </dl>
</div>"""


# ── Privacy Policy (POPIA) ───────────────────────────────────────────────────
PRIVACY = [
    ("who", "1. Who we are", f"""
<p>This policy explains how {v("registered_name", "registered name")}, trading as Down Low Cannabis (“DLC”, “we”, “us”), handles personal information about its members and website visitors, as a responsible party under the Protection of Personal Information Act 4 of 2013 (“POPIA”).</p>
<p>DLC is a private members’ club. This policy covers the DLC website, the member area (bag, exchange requests and account) and the membership records we keep at the lounge.</p>
{contact_card()}
<p>Our Information Officer is registered with the Information Regulator under reference {v("regulator_registration", "Information Regulator registration reference")}.</p>"""),

    ("collect", "2. What we collect", """
<p><strong>When you apply for membership</strong> (online or at the lounge): your full name, email address, mobile number, residential address, date of birth, South African ID number or passport number, your digital signature on the membership application, and whether you want to receive member news.</p>
<p><strong>While you are a member:</strong> your Member ID; your exchange requests and exchange history (products, quantities, credits, discounts, DLC Credits and points); the contact number, delivery or collection details and notes you give with a request; your saved bag, saved items and saved delivery addresses; and records of your visits and exchanges at the lounge.</p>
<p><strong>When you accept our terms</strong> — on your membership application and with each exchange request — we record which versions of the Terms &amp; Conditions and this policy you accepted, the statement you agreed to, the date and time, and your IP address and browser type, as evidence of your acceptance.</p>
<p><strong>Automatically, when you use the website:</strong> technical information our hosting providers need to deliver the site securely — such as IP address, browser and device type, and the time of each request — and the cookies and browser storage described in our <a href="cookies.html">Cookie Policy</a>.</p>
<p><strong>Under-18s.</strong> Membership and this website are strictly for adults aged 18 and over. We confirm age at the door of the website and verify it against your date of birth and identity document. If we learn we hold information about someone under 18, we delete it.</p>
<p><strong>Sensitive information.</strong> We do not ask for health information. We recognise that a member’s exchange history — for example of wellness products — could reveal something personal, so we treat exchange history as confidential and restrict it to the purposes below.</p>"""),

    ("why", "3. Why we use it", """
<p>We process personal information only for a specific, lawful purpose (POPIA sections 11 and 13):</p>
<ul>
<li><strong>To run your membership</strong> — verifying your age and identity, issuing your Member ID, keeping your membership record, and recognising you at the lounge. <em>Basis: necessary to carry out our membership agreement with you.</em></li>
<li><strong>To handle exchange requests</strong> — preparing your bag, contacting you about a request, handing it over to you and settling the exchange, applying member discounts, DLC Credits and points. <em>Basis: necessary to carry out our agreement with you.</em></li>
<li><strong>To meet legal obligations</strong> — age-verification, keeping evidence that you accepted our terms, record-keeping, tax and accounting records, and responding to lawful requests from authorities. <em>Basis: compliance with the law.</em></li>
<li><strong>To keep DLC safe and working</strong> — securing member accounts, preventing misuse and fraud, fixing faults and improving the service. <em>Basis: our legitimate interests, balanced against yours.</em></li>
<li><strong>To send member news</strong> — only if you opted in. <em>Basis: your consent.</em></li>
</ul>
<p>We do not use your information for automated decisions that have legal or similarly significant effects on you.</p>"""),

    ("marketing", "4. Member news and direct marketing", """
<p>We send drops, specials and member news only to members who have opted in (POPIA section 69). The option is unticked by default on the membership application. You can opt out at any time from your account, and every marketing message will tell you how to opt out. Opting out never affects your membership.</p>"""),

    ("share", "5. Who we share it with", """
<p>Your information is seen by authorised DLC staff who need it to do their work. We also use trusted service providers (“operators” under POPIA) who process information only on our instructions and under an obligation to keep it secure and confidential:</p>
<ul>
<li>our membership and exchange system (CDASH) and its database host;</li>
<li>our website hosting provider;</li>
<li>any messaging service we use to notify staff of new registrations or requests;</li>
<li>professional advisers such as auditors and attorneys, under a duty of confidentiality.</li>
</ul>
<p>We disclose information to authorities only where the law requires it. We never rent, trade or otherwise make your personal information available to anyone for their own marketing.</p>"""),

    ("transfers", "6. Information stored outside South Africa", f"""
<p>Some of our service providers store data on servers outside South Africa. Our member database is hosted in {v("data_region", "hosting region of the member database")}. Where information leaves South Africa we use providers bound by laws, binding rules or agreements that give it protection comparable to POPIA (section 72).</p>"""),

    ("security", "7. How we protect it", """
<p>We take appropriate, reasonable technical and organisational measures to keep personal information secure (POPIA section 19), including:</p>
<ul>
<li>encrypted (HTTPS) connections for the whole website;</li>
<li>member sessions held in signed, HTTP-only cookies that website scripts cannot read;</li>
<li>database access keys kept on our servers only, never sent to your browser;</li>
<li>access to member records limited to authorised staff, with an audit trail of changes.</li>
</ul>
<p>If we have reasonable grounds to believe your personal information has been accessed or acquired by an unauthorised person, we will notify the Information Regulator and you as soon as reasonably possible (section 22).</p>
<p>Please keep your Member ID private. Anyone who has it can enter the member area as you.</p>"""),

    ("retention", "8. How long we keep it", f"""
<p>We keep personal information only as long as we need it for the purposes above or as the law requires (POPIA section 14):</p>
<ul>
<li><strong>Membership records</strong> — for as long as you are a member and {v("retention_years", "number of years")} afterwards.</li>
<li><strong>Exchange and accounting records</strong> — for the periods required by South African tax and company law (generally at least five years).</li>
<li><strong>Records of your acceptance of our terms</strong> — for as long as the membership or exchange record they relate to is kept.</li>
<li><strong>Saved bag, saved items and saved addresses</strong> — until you remove them or your membership ends.</li>
<li><strong>Browser storage</strong> — as set out in the <a href="cookies.html">Cookie Policy</a>.</li>
</ul>
<p>When information is no longer needed we delete or de-identify it.</p>"""),

    ("rights", "9. Your rights", f"""
<p>Under POPIA you have the right to:</p>
<ul>
<li>ask whether we hold personal information about you and request a copy of it;</li>
<li>ask us to correct or update information that is inaccurate or out of date — many details can be updated directly in <a href="/account">your account</a>;</li>
<li>ask us to delete information we are no longer entitled to keep;</li>
<li>object to processing based on our legitimate interests, and object to direct marketing at any time;</li>
<li>withdraw consent you have given, such as for member news or optional cookies;</li>
<li>lodge a complaint with the Information Regulator.</li>
</ul>
<p>To make a request, contact our Information Officer at {mail("information_officer_email", "Information Officer email")}. We may need to verify your identity first, and we will respond within a reasonable time. Requests for records may also be made under the Promotion of Access to Information Act 2 of 2000 — our PAIA manual is available {f'<a href="{escape(COMPANY["paia_manual_url"])}">here</a>' if COMPANY.get("paia_manual_url") else v("paia_manual_url", "link to PAIA manual, or 'on request'")}.</p>
<p><strong>Information Regulator (South Africa)</strong> · <a href="https://inforegulator.org.za" rel="noopener">inforegulator.org.za</a></p>"""),

    ("cookies", "10. Cookies", """
<p>We use strictly necessary cookies to run the 18+ check and your member session, and optional browser storage only with your consent. See the <a href="cookies.html">Cookie Policy</a> for the full list, or change your choice in <a href="#cookie-settings" data-cookie-settings>Cookie settings</a>.</p>"""),

    ("changes", "11. Changes to this policy", """
<p>We will update this policy when our services or the law change, and show the date of the latest version at the top of this page. If a change materially affects how we use information you have already given us, we will tell members before it takes effect.</p>"""),
]

# ── Terms & Conditions (CPA, ECTA) ───────────────────────────────────────────
TERMS = [
    ("about", "1. About DLC and these terms", f"""
<p>These terms apply to your membership of Down Low Cannabis (“DLC”) and your use of this website and the member area. The website is operated by {v("registered_name", "registered name")}. By entering the member area or sending an exchange request you agree to these terms, so please read them — and our <a href="privacy.html">Privacy Policy</a> — carefully.</p>
<p>Nothing in these terms limits any right you have under the Consumer Protection Act 68 of 2008 (“CPA”) or the Electronic Communications and Transactions Act 25 of 2002 (“ECTA”) that cannot lawfully be limited. Terms that limit our responsibility are shown in <strong>bold</strong> so you can find them easily.</p>
<p>The information the ECTA requires us to publish (section 43):</p>
{contact_card()}"""),

    ("membership", "2. Membership and eligibility", """
<ul>
<li>DLC is a private members’ club. The member area is available only to active DLC members aged <strong>18 or older</strong> whose identity has been verified.</li>
<li>Each member has one Member ID. It is personal: keep it private and do not let anyone else use it. You are responsible for exchange requests made with your Member ID unless you have told us it has been compromised.</li>
<li>The details you give us must be true and kept up to date.</li>
<li>We may suspend or end a membership where a member breaches these terms or the club rules, gives false information, or where the law requires it. We will tell you why, unless the law prevents us.</li>
</ul>"""),

    ("private-use", "3. Private use only", """
<p>Products exchanged through DLC are for the member’s own private use. You must not supply, exchange or distribute them to any other person, including anyone under 18. You are responsible for complying with the law that applies to you, including the Cannabis for Private Purposes Act, 2024, wherever you use or keep products.</p>"""),

    ("credits", "4. Credits and product information", """
<ul>
<li>All amounts on the website are shown in <strong>DLC credits</strong> (for example “C 79.99”).</li>
<li>Stock and credits are shown live from the lounge, but availability can change during the day. Your bag does not hold stock.</li>
<li>Where no photograph of an exact product is available we show DLC collection artwork, and say so. Tested potency figures (THC, CBD) are available from the team in store.</li>
<li>If a product is shown with the wrong credits because of an obvious error, we will tell you before your exchange is settled and you may choose to go ahead at the correct credits or cancel.</li>
</ul>"""),

    ("requests", "5. How exchange requests work", """
<ol>
<li><strong>Review.</strong> Before you send a request you can see everything in your bag, change quantities, remove products, correct your details and see the credits for settling in cash and by card (ECTA section 43(2)). You can leave at any point without sending anything.</li>
<li><strong>Request.</strong> Sending an exchange request asks DLC to prepare the products for you. It is not yet a completed exchange. We may decline a request — for example if stock has run out, your membership is not active, or the law requires it — and we will tell you if we do.</li>
<li><strong>Confirmation.</strong> The DLC team confirms your request and the final credits with you, usually by message to the number you gave.</li>
<li><strong>Hand-over and settlement.</strong> Nothing is settled online. The exchange is completed and settled with you in person at hand-over, in cash or by card. Your member discount depends on how you settle, which is why your bag shows both figures. DLC Credits may be applied within the programme’s limits shown in your bag, and points are earned on the amount actually settled.</li>
</ol>
<p>You may cancel a request at no cost at any time before hand-over by contacting us.</p>"""),

    ("handover", "6. Hand-over, delivery and collection", """
<ul>
<li>We hand products over only to the verified member who made the request, in person. We may ask to see your ID, and we never hand over to anyone under 18.</li>
<li>Any delivery arrangement and its credits are confirmed with you before hand-over. Ownership and responsibility pass to you at hand-over.</li>
</ul>"""),

    ("returns", "7. Cooling-off, returns and defective products", """
<p><strong>Cooling-off.</strong> Where an exchange is concluded through this website, you may be entitled under ECTA section 44 to cancel within seven days of receiving the products, without reason or penalty, subject to the exclusions in section 42 — which include goods that by their nature cannot be returned or are likely to deteriorate rapidly. For health and safety reasons, products that have been opened, used or unsealed cannot be taken back unless they are defective.</p>
<p><strong>Defective products.</strong> Under the CPA (sections 55 and 56) products must be of good quality, safe and as described. If a product is defective you may return it within six months of hand-over, and we will repair or replace it, or reverse the exchange, as the CPA provides.</p>
<p>To arrange a return, contact us with your exchange number. Returned products must be handed back in person.</p>"""),

    ("health", "8. Health and responsible use", """
<ul>
<li>Information on this website, including the DLC Decoder, is general information only. It is <strong>not medical advice</strong>, and wellness products are not intended to diagnose, treat, cure or prevent any disease. Speak to a healthcare professional before using cannabis products, especially if you take medication, have a medical condition, or are pregnant or breastfeeding.</li>
<li>Do not drive, operate machinery or work at heights under the influence.</li>
<li>Store products securely and out of reach of children and pets.</li>
</ul>"""),

    ("use", "9. Using the website", """
<p>You may use the website only for lawful purposes connected with your membership. You must not try to interfere with its security or operation, access another member’s account, or copy the site’s content or data by automated means.</p>
<p>The DLC name, logo, artwork, photographs and website design belong to DLC or its licensors and may not be reused without our written permission.</p>"""),

    ("liability", "10. Our responsibility to you", """
<p><strong>To the extent the law allows, DLC is not responsible for loss caused by: temporary unavailability of the website; information you gave us that was wrong; your use of products contrary to these terms, the product information or the law; or events beyond our reasonable control.</strong> This does not limit our responsibility for loss caused by our gross negligence, or any liability that cannot lawfully be limited under the CPA.</p>"""),

    ("complaints", "11. Complaints", f"""
<p>If something is not right, please tell us first — {mail("email", "contact email")} or {v("phone", "telephone number")} — and we will try to resolve it within a reasonable time.</p>
<p>If you are not satisfied, you may refer a consumer complaint to the Consumer Goods and Services Ombud or the National Consumer Commission, and a privacy complaint to the Information Regulator.</p>"""),

    ("general", "12. General", """
<ul>
<li>These terms are governed by the laws of the Republic of South Africa.</li>
<li>We may update these terms when our services or the law change. The latest version, with its date, is always on this page, and changes do not affect exchanges already settled.</li>
<li>If any part of these terms is found to be unenforceable, the rest remains in force.</li>
</ul>"""),
]

# ── Cookie Policy ────────────────────────────────────────────────────────────
def table(rows):
    body = "".join(
        f"<tr><td><code>{escape(name)}</code></td><td>{escape(kind)}</td><td>{escape(purpose)}</td><td>{escape(life)}</td></tr>"
        for name, kind, purpose, life in rows
    )
    return f'<div class="legal-table-wrap"><table class="legal-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Purpose</th><th scope="col">Kept for</th></tr></thead><tbody>{body}</tbody></table></div>'


NECESSARY = [
    ("dlc_age_confirmed", "Cookie (HTTP-only)", "Records that you confirmed you are 18 or older.", "Until you close your browser"),
    ("dlc_member_access", "Cookie (HTTP-only, signed)", "Keeps you signed in to the member area with your verified Member ID. Cannot be read by website scripts.", "7 days"),
    ("dlc_consent", "Cookie", "Remembers your cookie choices so we do not ask on every page.", "12 months"),
    ("dlc_age_verified_v1", "Local storage", "Avoids flashing the 18+ screen at a device that has already confirmed. Holds only “yes”.", "Until cleared"),
    ("dlc_member_verified_v1", "Local storage", "Avoids flashing the Member ID screen at a signed-in device. Holds only “yes” — never your Member ID.", "Until cleared"),
    ("dlc_catalog_cache_v1", "Session storage", "A copy of the product list so pages load quickly on a slow connection. Contains no personal information.", "Until you close the tab"),
    ("dlcLoungeState, dlcReturnToLounge, dlcCollectionState, dlcCollectionCrossScroll, dlcTransitionIn", "Session storage", "Returns you to the same place in the lounge or a collection when you go back. No personal information.", "Until you close the tab"),
]
PREFERENCES = [
    ("dlc_guidance_enabled_v1", "Local storage", "Remembers whether guidance mode is switched on.", "Until cleared or consent withdrawn"),
    ("dlc_recent_products_v1", "Local storage", "Shows your recently viewed products on this device.", "Until cleared or consent withdrawn"),
    ("dlc_decoder_topic_v1", "Session storage", "Reopens the DLC Decoder on your last topic.", "Until you close the tab"),
]

COOKIES = [
    ("what", "1. What this policy covers", """
<p>Cookies are small files a website stores in your browser. Websites can also keep information in your browser’s “local storage” and “session storage”. This policy lists everything the DLC website stores this way, why, and for how long. It forms part of our <a href="privacy.html">Privacy Policy</a>.</p>
<p>We do not use advertising cookies, and we do not allow third parties to track you across other websites.</p>"""),
    ("necessary", "2. Strictly necessary", f"""
<p>These are essential for the 18+ check and the member area to work, so they do not need your consent. Blocking them in your browser will stop the member area from working.</p>
{table(NECESSARY)}"""),
    ("preferences", "3. Preferences (optional)", f"""
<p>These remember choices that make browsing easier on your device. They are only stored if you allow “Preferences” in Cookie settings, and are deleted if you later switch it off.</p>
{table(PREFERENCES)}"""),
    ("analytics", "4. Analytics (optional)", """
<p>We do not currently use any analytics service. If we introduce one, it will run only for visitors who have switched on “Analytics” in Cookie settings, and we will list it here first.</p>"""),
    ("control", "5. Your choices", """
<p>You can change your choice at any time in <a href="#cookie-settings" data-cookie-settings>Cookie settings</a> (also linked at the foot of every page). Your browser settings also let you view and delete cookies and site storage. We ask for your choice again every 12 months.</p>"""),
    ("changes", "6. Changes", """
<p>If we add or change anything we store, we will update this list and the date at the top of this page before it takes effect.</p>"""),
]


def main():
    pages = [
        ("privacy", "Privacy Policy", "PRIVACY<br>POLICY.", "How Down Low Cannabis collects, uses and protects members’ personal information under POPIA.",
         "How DLC collects, uses and protects personal information, and the rights you have under the Protection of Personal Information Act.", PRIVACY),
        ("terms", "Terms & Conditions", "TERMS &amp;<br>CONDITIONS.", "Membership, exchange requests, hand-over, returns and website terms for Down Low Cannabis members.",
         "The terms of DLC membership and the member area: eligibility, exchange requests, hand-over and settlement, returns, and your rights under the CPA and ECTA.", TERMS),
        ("cookies", "Cookie Policy", "COOKIE<br>POLICY.", "The cookies and browser storage the Down Low Cannabis website uses, and how to control them.",
         "Everything the DLC website stores in your browser, why it is needed, how long it stays, and how to change your choices.", COOKIES),
    ]
    for slug, title, h1, description, intro, sections in pages:
        (PUBLIC / f"{slug}.html").write_text(page(slug, title, h1, description, intro, sections), encoding="utf-8")
        print(f"wrote public/{slug}.html")
    todo = [key for key, value in COMPANY.items() if not value]
    if todo:
        print(f"\n{len(todo)} company detail(s) still to confirm: {', '.join(todo)}")


if __name__ == "__main__":
    main()
