import requests
import re
import json
from bs4 import BeautifulSoup

def summarize_structure(soup) -> dict:
    """
    - analyze DOM structure of a product page and return structural traits
    """
    heading_hierarchy = []
    for tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
        elements = soup.find_all(tag)
        for elem in elements:
            text = elem.get_text(strip=True)
            if text:
                heading_hierarchy.append(f"{tag}: {text}")
    
    h1_count = len(soup.find_all('h1'))
    has_subheadings = bool(soup.find_all(['h2', 'h3']))
    
    def get_depth(element, current_depth=0):
        if not element.children:
            return current_depth
        max_child_depth = current_depth
        for child in element.children:
            if hasattr(child, 'name') and child.name:
                child_depth = get_depth(child, current_depth + 1)
                max_child_depth = max(max_child_depth, child_depth)
        return max_child_depth
    
    max_dom_depth = get_depth(soup) if soup else 0
    section_count = len(soup.find_all('section'))
    main_present = bool(soup.find('main'))
    
    cta_grouping = False
    cta_texts = ["add to cart", "add to bag", "buy now", "buy", "checkout", "order now", "shop now",
                 "get started", "start now", "get started now", "try now", "try free", "sign up", "signup",
                 "contact sales", "talk to sales", "schedule demo", "book demo", "request demo", "learn more",
                 "download", "subscribe", "join now", "register", "create account", "free trial"]
    cta_node = None
    
    for cta_text in cta_texts:
        button_elements = soup.find_all(["button", "a", "input"])
        for button_element in button_elements:
            button_text = (button_element.get("value") or button_element.get("aria-label") or button_element.get_text(strip=True)).lower()
            if cta_text in button_text:
                cta_node = button_element
                break
        if cta_node:
            break
    
    if cta_node:
        cta_parent = cta_node.parent
        if cta_parent:
            parent_text = cta_parent.get_text(strip=True).lower()
            price_pattern = r'[\$\£\€]\s*\d[\d,]*(?:\.\d{2})?'
            has_price = bool(re.search(price_pattern, parent_text))
            product_keywords = ["chocolate", "truffle", "box", "assorted", "product", "item"]
            has_title = any(keyword in parent_text for keyword in product_keywords)
            cta_grouping = has_price or has_title
    
    cta_position = None
    if cta_node:
        all_interactive = soup.find_all(["button", "a", "input"])
        try:
            cta_position = all_interactive.index(cta_node)
        except ValueError:
            cta_position = None
    
    gallery_present = False
    img_containers = {}
    for img in soup.find_all('img'):
        parent = img.parent
        if parent:
            parent_id = id(parent)
            if parent_id not in img_containers:
                img_containers[parent_id] = []
            img_containers[parent_id].append(img)
    
    for container_imgs in img_containers.values():
        if len(container_imgs) > 1:
            gallery_present = True
            break
    
    modals_with_cta = False
    modal_selectors = ['[class*="modal"]', '[class*="popup"]', '[class*="overlay"]', '[role="dialog"]']
    for selector in modal_selectors:
        modals = soup.select(selector)
        for modal in modals:
            modal_text = modal.get_text(strip=True).lower()
            if any(cta_text in modal_text for cta_text in cta_texts):
                modals_with_cta = True
                break
        if modals_with_cta:
            break
    
    return {
        "heading_hierarchy": heading_hierarchy,
        "h1_count": h1_count,
        "has_subheadings": has_subheadings,
        "max_dom_depth": max_dom_depth,
        "section_count": section_count,
        "main_present": main_present,
        "cta_grouping": cta_grouping,
        "cta_position": cta_position,
        "gallery_present": gallery_present,
        "modals_with_cta": modals_with_cta
    }

def detect_site_type(soup) -> str:
    """
    - detect site type for appropriate heuristics
    """
    page_text = soup.get_text().lower()
    
    # ecommerce indicators
    ecommerce_keywords = ["add to cart", "shopping cart", "checkout", "buy now", "add to bag", 
                         "in stock", "out of stock", "quantity", "shipping", "delivery"]
    ecommerce_score = sum(1 for keyword in ecommerce_keywords if keyword in page_text)
    
    # saas indicators  
    saas_keywords = ["get started", "free trial", "sign up", "login", "dashboard", "pricing", 
                    "per month", "per year", "subscription", "api", "integration"]
    saas_score = sum(1 for keyword in saas_keywords if keyword in page_text)
    
    # b2b indicators
    b2b_keywords = ["enterprise", "contact sales", "schedule demo", "request quote", "solutions",
                   "partners", "case study", "whitepaper", "roi", "implementation"]
    b2b_score = sum(1 for keyword in b2b_keywords if keyword in page_text)
    
    # service indicators
    service_keywords = ["book now", "appointment", "consultation", "quote", "estimate", 
                       "contact us", "call now", "schedule", "service"]
    service_score = sum(1 for keyword in service_keywords if keyword in page_text)
    
    scores = {
        "ecommerce": ecommerce_score,
        "saas": saas_score, 
        "b2b": b2b_score,
        "service": service_score
    }
    
    return max(scores, key=scores.get) if max(scores.values()) > 0 else "generic"

def get_dynamic_keywords(site_type: str) -> dict:
    """
    - get keywords based on site type
    """
    keyword_sets = {
        "ecommerce": {
            "product": ["product", "item", "goods", "merchandise", "inventory", "catalog"],
            "cta": ["add to cart", "buy now", "purchase", "order now", "shop now", "add to bag"],
            "pricing": ["price", "cost", "sale", "discount", "deal", "offer", "special"]
        },
        "saas": {
            "product": ["software", "platform", "tool", "service", "solution", "app", "system"],
            "cta": ["get started", "try free", "sign up", "start trial", "demo", "learn more"],
            "pricing": ["pricing", "plan", "subscription", "per month", "per year", "tier"]
        },
        "b2b": {
            "product": ["solution", "platform", "service", "system", "software", "tool", "technology"],
            "cta": ["contact sales", "get quote", "schedule demo", "request info", "talk to sales"],
            "pricing": ["pricing", "investment", "cost", "quote", "estimate", "custom pricing"]
        },
        "service": {
            "product": ["service", "consultation", "support", "help", "solution", "expertise"],
            "cta": ["book now", "contact us", "get quote", "call now", "schedule", "appointment"],
            "pricing": ["price", "cost", "rate", "fee", "investment", "quote", "estimate"]
        },
        "generic": {
            "product": ["product", "item", "service", "solution", "offering", "option"],
            "cta": ["learn more", "get started", "contact us", "find out more", "discover"],
            "pricing": ["price", "cost", "pricing", "investment", "value", "rate"]
        }
    }
    return keyword_sets.get(site_type, keyword_sets["generic"])

def extract_basic_info(soup, keywords) -> dict:
    """
    - extract title and h1 using dynamic keywords
    """
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    
    h1 = ""
    h1_elements = soup.find_all("h1")
    product_keywords = keywords["product"]
    
    # try product keywords first
    for h1_elem in h1_elements:
        h1_text = h1_elem.get_text(strip=True)
        if any(keyword in h1_text.lower() for keyword in product_keywords):
            h1 = h1_text
            break
    
    # fallback: no ui words
    if not h1:
        for h1_elem in h1_elements:
            h1_text = h1_elem.get_text(strip=True)
            if not any(ui_word in h1_text.lower() for ui_word in ["cart", "checkout", "login", "sign in", "menu", "navigation", "your"]):
                h1 = h1_text
                break
    
    # fallback: other headings
    if not h1:
        for tag in ['h2', 'h3', 'h4', 'h5', 'h6']:
            elements = soup.find_all(tag)
            for elem in elements:
                elem_text = elem.get_text(strip=True)
                if any(keyword in elem_text.lower() for keyword in product_keywords):
                    h1 = elem_text
                    break
            if h1:
                break
    
    # last resort: first h1
    if not h1 and h1_elements:
        h1 = h1_elements[0].get_text(strip=True)
    
    return {"title": title, "h1": h1}

def extract_pricing_info(soup) -> dict:
    """
    - extract pricing with various formats and currencies
    """
    price = ""
    price_selectors = [".price", "[class*=price]", "[id*=price]", "[data-price]"]
    
    # try css selectors first
    for selector in price_selectors:
        price_element = soup.select_one(selector)
        if price_element and price_element.get_text(strip=True):
            price = price_element.get_text(strip=True)
            break
    
    # fallback: regex patterns
    if not price:
        price_patterns = [
            # currency with per-unit
            r'[\$\£\€¥₹]\s*\d[\d,]*(?:\.\d{2})?\s*(?:per\s+(?:minute|month|year|day|hour|user|seat|license|unit)|/min|/mo|/yr|/day|/hr|/user|/seat)',
            # standard currency
            r'[\$\£\€¥₹]\s*\d[\d,]*(?:\.\d{2})?',
            # per-unit with currency
            r'(?:per\s+(?:minute|month|year|day|hour|user|seat|license|unit)|/min|/mo|/yr|/day|/hr|/user|/seat)\s*[\$\£\€¥₹]\s*\d[\d,]*(?:\.\d{2})?',
            # free pricing
            r'(?:free|no cost|complimentary|gratis)\b',
            # custom pricing
            r'(?:custom|contact|quote|estimate|call|negotiable)\s*(?:pricing|price|cost)',
            # range pricing
            r'[\$\£\€¥₹]\s*\d[\d,]*(?:\.\d{2})?\s*[-–—]\s*[\$\£\€¥₹]\s*\d[\d,]*(?:\.\d{2})?'
        ]
        
        all_text = soup.get_text()
        for pattern in price_patterns:
            price_matches = re.findall(pattern, all_text, re.I)
            if price_matches:
                for match in price_matches:
                    # clean up spacing
                    cleaned_match = re.sub(r'(\d)(per|/min|/mo|/yr|/day|/hr)', r'\1 \2', match)
                    num = re.sub(r"[^\d.]", "", match)
                    try:
                        if float(num) >= 0.01:  # lower threshold for per-minute
                            price = cleaned_match.strip()
                            break
                    except Exception:
                        continue
                if price:
                    break
    
    return {"price": price}

def extract_cta_info(soup, keywords) -> dict:
    """
    - extract cta info and positioning using dynamic keywords
    """
    add_to_cart = None
    # use dynamic cta keywords
    cta_texts = keywords["cta"] + [
        "learn more", "find out more", "discover", "explore", "view details", "see more",
        "download", "subscribe", "join now", "register", "create account", "free trial",
        "start free", "get demo", "watch demo", "view demo", "try it free", "test drive"
    ]
    
    # find first matching cta
    for cta_text in cta_texts:
        button_elements = soup.find_all(["button", "a", "input"])
        for button_element in button_elements:
            button_text = (button_element.get("value") or button_element.get("aria-label") or button_element.get_text(strip=True)).lower()
            if cta_text in button_text:
                add_to_cart = button_element.get_text(strip=True)
                break
        if add_to_cart:
            break

    # find cta node for positioning
    cta_node = None
    for cta_text in cta_texts:
        button_elements = soup.find_all(["button", "a", "input"])
        for button_element in button_elements:
            button_text = (button_element.get("value") or button_element.get("aria-label") or button_element.get_text(strip=True)).lower()
            if cta_text in button_text:
                cta_node = button_element
                break
        if cta_node:
            break

    # check if price is near cta
    price_near_cta = False
    if cta_node:
        # check cta element and parents (up to 3 levels)
        for scope in [cta_node, cta_node.parent, cta_node.parent.parent if cta_node.parent else None, 
                     cta_node.parent.parent.parent if cta_node.parent and cta_node.parent.parent else None]:
            if scope:
                scope_text = scope.get_text(strip=True)
                # look for price patterns
                price_patterns = [
                    r'[\$\£\€]\s*\d[\d,]*(?:\.\d{2})?\s*(?:per\s+(?:minute|month|year|day|hour|user|seat|license|unit)|/min|/mo|/yr|/day|/hr|/user|/seat)',
                    r'[\$\£\€]\s*\d[\d,]*(?:\.\d{2})?',
                    r'(?:per\s+(?:minute|month|year|day|hour|user|seat|license|unit)|/min|/mo|/yr|/day|/hr|/user|/seat)\s*[\$\£\€]\s*\d[\d,]*(?:\.\d{2})?'
                ]
                for pattern in price_patterns:
                    if re.search(pattern, scope_text, re.I):
                        price_near_cta = True
                        break
                if price_near_cta:
                    break

    # check if cta is above fold
    cta_above_fold = False
    if cta_node:
        all_clickables = soup.find_all(["button", "a", "input"])
        try:
            cta_index = all_clickables.index(cta_node)
            # more lenient for saas - first 20% as above fold
            cta_above_fold = cta_index <= max(5, int(0.2 * len(all_clickables)))
        except ValueError:
            cta_above_fold = False

    # check for shipping/returns near cta
    shipping_returns_near_cta = False
    if cta_node:
        scope_text = (cta_node.parent or cta_node).get_text(strip=True).lower()
        ship_ret_words = ["free shipping", "shipping", "delivery", "returns", "refund"]
        shipping_returns_near_cta = any(word in scope_text for word in ship_ret_words)

    return {
        "cta": add_to_cart,
        "price_near_cta": price_near_cta,
        "cta_above_fold": cta_above_fold,
        "shipping_returns_near_cta": shipping_returns_near_cta
    }

def extract_image_info(soup) -> dict:
    """
    - extract image info and alt text coverage
    """
    image_elements = soup.find_all("img")
    image_count = len(image_elements)
    
    missing_alt_count = 0
    for image_element in image_elements:
        alt_text = image_element.get("alt") or ""
        if not alt_text.strip():
            missing_alt_count += 1

    alt_coverage = round((image_count - missing_alt_count) / image_count, 2) if image_count > 0 else 0.0

    return {
        "image_count": image_count,
        "images_missing_alt": missing_alt_count,
        "alt_coverage": alt_coverage
    }

def extract_testimonial_info(soup) -> dict:
    """
    - extract testimonials using multiple detection methods
    """
    testimonials = 0
    
    # Method 1: Look for testimonial sections and customer quotes
    testimonial_containers = soup.find_all(['div', 'section', 'article'], class_=re.compile(r'testimonial|customer|review|quote|feedback|endorsement', re.I))
    for container in testimonial_containers:
        # Count individual testimonial items within containers
        testimonial_items = container.find_all(['div', 'article', 'li', 'blockquote', 'p'], class_=re.compile(r'testimonial|customer|review|quote|feedback|endorsement', re.I))
        testimonials += len(testimonial_items)
    
    # Method 2: Look for quoted text patterns (customer quotes)
    if testimonials == 0:
        quoted_text = soup.find_all(string=re.compile(r'"[^"]{20,}"', re.I))  # Text in quotes, at least 20 chars
        testimonials = len(quoted_text)
    
    # Method 3: Look for review indicators and star ratings
    if testimonials == 0:
        review_indicators = soup.find_all(string=re.compile(r'out of 5|based on \d+ reviews|customer review|reviewed by|\d+\s*stars?|\d+\s*★', re.I))
        if review_indicators:
            for indicator in review_indicators:
                match = re.search(r'based on (\d+) reviews', indicator, re.I)
                if match:
                    testimonials = int(match.group(1))
                    break
            if testimonials == 0:
                testimonials = len(review_indicators)
    
    # Method 4: Look for customer names and titles (common in testimonials)
    if testimonials == 0:
        customer_patterns = soup.find_all(string=re.compile(r'(CEO|Founder|Manager|Director|President|VP|CTO|CMO|Marketing|Sales|Operations|Owner|Principal|Lead|Head|Chief)', re.I))
        testimonials = len(customer_patterns)
    
    # Method 5: Look for review dates
    if testimonials == 0:
        date_pattern = r'\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}'
        review_dates = soup.find_all(string=re.compile(date_pattern))
        testimonials = len(review_dates)
    
    # Method 6: Look for social proof elements
    if testimonials == 0:
        social_proof_elements = soup.find_all(string=re.compile(r'(?:loved by|used by|trusted by|recommended by|chosen by)\s+\d+', re.I))
        for element in social_proof_elements:
            match = re.search(r'(\d+)', element)
            if match:
                testimonials += int(match.group(1))
                break

    stars_present = "★" in soup.get_text() or "rating" in soup.get_text().lower() or "reviews" in soup.get_text().lower()
    has_reviews_or_ratings = bool(testimonials or stars_present)

    # Try to extract average rating from structured data
    average_rating = None
    try:
        scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
        for script in scripts:
            txt = script.string or script.get_text()
            if not txt:
                continue
            data = json.loads(txt.strip())
            objs = data if isinstance(data, list) else [data]
            for obj in objs:
                if not isinstance(obj, dict):
                    continue
                ar = obj.get("aggregateRating")
                if isinstance(ar, dict) and "ratingValue" in ar:
                    average_rating = float(str(ar["ratingValue"]).strip())
                    break
            if average_rating:
                break
    except Exception:
        pass

    return {
        "testimonials": testimonials,
        "has_reviews_or_ratings": has_reviews_or_ratings,
        "average_rating": average_rating
    }

def extract_trust_info(soup) -> dict:
    """
    - extract trust signals and social proof
    """
    # Legacy trust signals
    security_badges = len(soup.find_all('img[alt*="secure"], [class*="security"], [class*="ssl"]'))
    guarantees = len(soup.find_all(string=re.compile(r'guarantee|warranty|refund|money back', re.I)))
    
    page_text_low = soup.get_text().lower()
    trust_words = ["guarantee", "warranty", "refund", "money back", "secure", "ssl", "trusted by", "compliance", 
                   "fcc", "gdpr", "soc", "iso", "certified", "secure", "encrypted", "privacy", "data protection",
                   "leading", "enterprise", "fortune", "inc 500", "award", "recognized", "verified"]
    trust_text_hits = sum(1 for word in trust_words if word in page_text_low)
    
    # Look for client logos and trust indicators
    client_logos = len(soup.find_all('img[alt*="logo"], [class*="logo"], [class*="client"], [class*="partner"]'))
    trust_badges = len(soup.find_all('img[alt*="badge"], [class*="badge"], [class*="certification"]'))
    
    # Look for social proof elements
    social_proof = len(soup.find_all(string=re.compile(r'trusted by|used by|loved by|customers|clients|users|partners|enterprises|companies', re.I)))
    
    # Enhanced trust signal detection
    trust_indicators = {
        "security_badges": len(soup.find_all('img[alt*="secure"], [class*="security"], [class*="ssl"], [class*="certified"]')),
        "guarantees": len(soup.find_all(string=re.compile(r'guarantee|warranty|refund|money back|satisfaction|risk.free', re.I))),
        "client_logos": len(soup.find_all('img[alt*="logo"], [class*="logo"], [class*="client"], [class*="partner"], [class*="customer"]')),
        "trust_badges": len(soup.find_all('img[alt*="badge"], [class*="badge"], [class*="certification"], [class*="award"]')),
        "compliance": len(soup.find_all(string=re.compile(r'gdpr|hipaa|sox|pci|iso|soc|fcc|compliant|certified', re.I))),
        "awards": len(soup.find_all(string=re.compile(r'award|winner|recognized|featured|top|best|leading', re.I))),
        "numbers": len(soup.find_all(string=re.compile(r'\d+\+?\s*(?:customers|users|clients|companies|enterprises|years|countries)', re.I)))
    }

    return {
        "security_badges": security_badges,
        "guarantees": guarantees,
        "trust_text_hits": trust_text_hits,
        "client_logos": client_logos,
        "trust_badges": trust_badges,
        "social_proof": social_proof,
        "trust_indicators": trust_indicators
    }

def extract_technical_info(soup, response) -> dict:
    """
    - extract technical info, seo, accessibility, performance
    """
    forms = soup.find_all('form')
    popups = soup.find_all(['[class*="modal"], [class*="popup"], [class*="overlay"]'])
    form_fields = sum(len(f.find_all('input, select, textarea')) for f in forms)

    # Heading analysis
    headings = {}
    for i in range(1, 7):
        headings[f'h{i}_count'] = len(soup.find_all(f'h{i}'))

    # Mobile & SEO analysis
    viewport_present = bool(soup.find("meta", attrs={"name": "viewport"}))
    meta_desc = soup.find("meta", attrs={"name": "description"})
    meta_desc_content = (meta_desc.get("content") or "").strip() if meta_desc else ""
    meta_title_len = len(soup.title.string.strip() if soup.title and soup.title.string else "")
    meta_desc_len = len(meta_desc_content)
    has_og = bool(soup.find("meta", attrs={"property": "og:title"}) or soup.find("meta", attrs={"property": "og:description"}))
    has_canonical = bool(soup.find("link", rel=lambda v: v and "canonical" in v))

    # Findability features
    breadcrumbs_present = bool(soup.select_one('[aria-label="breadcrumb"], nav.breadcrumb, .breadcrumb'))
    related_products_present = bool(soup.select_one('[class*="related" i], [id*="related" i], [data-section*="related" i]'))
    has_search = bool(soup.select_one('input[type="search"], form[role="search"]'))

    # Performance proxies
    scripts = soup.find_all("script")
    external_scripts = [s for s in scripts if s.get("src")]
    external_script_count = len(external_scripts)
    inline_script_count = len(scripts) - external_script_count
    html_bytes = len(response.text.encode("utf-8"))

    # Accessibility analysis
    unlabeled_buttons = sum(1 for b in soup.find_all("button") if not (b.get_text(strip=True) or b.get("aria-label")))
    unlabeled_links = sum(1 for a in soup.find_all("a") if not (a.get_text(strip=True) or a.get("aria-label")))

    return {
        "form_count": len(forms),
        "form_fields": form_fields,
        "popup_count": len(popups),
        "headings": headings,
        "viewport_present": viewport_present,
        "meta_title_len": meta_title_len,
        "meta_description_len": meta_desc_len,
        "og_tags_present": has_og,
        "canonical_present": has_canonical,
        "breadcrumbs_present": breadcrumbs_present,
        "related_products_present": related_products_present,
        "has_search": has_search,
        "html_bytes": html_bytes,
        "external_script_count": external_script_count,
        "inline_script_count": inline_script_count,
        "a11y_unlabeled_buttons": unlabeled_buttons,
        "a11y_unlabeled_links": unlabeled_links
    }

def run_heuristics(url: str) -> dict:
    """
    - analyze product page and extract conversion signals
    """
    # print(f"fetching url: {url}")  # debug
    response = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    # print(f"successfully parsed html, title: {soup.title.string if soup.title else 'None'}")  # debug

    # Detect site type and get appropriate keywords
    site_type = detect_site_type(soup)
    keywords = get_dynamic_keywords(site_type)
    
    # Extract all information using specialized functions
    basic_info = extract_basic_info(soup, keywords)
    pricing_info = extract_pricing_info(soup)
    cta_info = extract_cta_info(soup, keywords)
    image_info = extract_image_info(soup)
    testimonial_info = extract_testimonial_info(soup)
    trust_info = extract_trust_info(soup)
    technical_info = extract_technical_info(soup, response)
    
    # Get structural analysis
    structure_data = summarize_structure(soup)

    # Combine all extracted data
    return {
        # site detection
        "site_type": site_type,
        
        # essentials
        **basic_info,
        **pricing_info,
        **cta_info,

        # imagery
        **image_info,

        # social proof
        **testimonial_info,

        # trust (legacy + enhanced)
        **trust_info,

        # technical info
        **technical_info,
        
        # structural analysis
        **structure_data
    }