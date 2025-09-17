import requests
import re
import json
from bs4 import BeautifulSoup

def summarize_structure(soup) -> dict:
    """
    -analyze DOM structure of a product page and return structural traits
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
    cta_texts = ["add to cart", "add to bag", "buy now", "buy", "checkout", "order now", "shop now"]
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

def run_heuristics(url: str) -> dict:
    """
    - analyze a product page and extract key conversion signals
    - returns dict with heuristics data for price, cta, reviews, trust signals, etc.
    """
    # print(f"fetching url: {url}")  # debug
    response = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    # print(f"successfully parsed html, title: {soup.title.string if soup.title else 'None'}")  # debug

    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    
    h1 = ""
    h1_elements = soup.find_all("h1")
    
    product_keywords = ["chocolate", "truffle", "box", "assorted", "product", "item"]
    for h1_elem in h1_elements:
        h1_text = h1_elem.get_text(strip=True)
        if any(keyword in h1_text.lower() for keyword in product_keywords):
            h1 = h1_text
            break
    
    if not h1:
        for h1_elem in h1_elements:
            h1_text = h1_elem.get_text(strip=True)
            if not any(ui_word in h1_text.lower() for ui_word in ["cart", "checkout", "login", "sign in", "menu", "navigation", "your"]):
                h1 = h1_text
                break
    
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
    
    if not h1 and h1_elements:
        h1 = h1_elements[0].get_text(strip=True)

    price = ""
    price_selectors = [".price", "[class*=price]", "[id*=price]", "[data-price]"]
    for selector in price_selectors:
        price_element = soup.select_one(selector)
        if price_element and price_element.get_text(strip=True):
            price = price_element.get_text(strip=True)
            # print(f"found price: {price}")  # debug
            break
    
    if not price:
        price_pattern = r'[\$\£\€]\s*\d[\d,]*(?:\.\d{2})?'
        all_text = soup.get_text()
        price_matches = re.findall(price_pattern, all_text)
        if price_matches:
            for match in price_matches:
                num = re.sub(r"[^\d.]", "", match)
                try:
                    if float(num) >= 10.0:
                        price = match
                        break
                except Exception:
                    continue

    add_to_cart = None
    cta_texts = [
        "add to cart", "add to bag", "buy now", "buy", "checkout", "order now", "shop now"
    ]
    for cta_text in cta_texts:
        button_elements = soup.find_all(["button", "a", "input"])
        for button_element in button_elements:
            button_text = (button_element.get("value") or button_element.get("aria-label") or button_element.get_text(strip=True)).lower()
            if cta_text in button_text:
                add_to_cart = button_element.get_text(strip=True)
                # print(f"found cta: {add_to_cart}")  # debug
                break
        if add_to_cart:
            break

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

    price_near_cta = False
    if cta_node:
        for scope in [cta_node, cta_node.parent, cta_node.parent.parent if cta_node.parent else None]:
            if scope:
                scope_text = scope.get_text(strip=True)
                if re.search(r'[\$\£\€]\s*\d[\d,]*(?:\.\d{2})?', scope_text):
                    price_near_cta = True
                    break

    cta_above_fold = False
    if cta_node:
        all_clickables = soup.find_all(["button", "a", "input"])
        try:
            cta_index = all_clickables.index(cta_node)
            cta_above_fold = cta_index <= max(3, int(0.1 * len(all_clickables)))
        except ValueError:
            cta_above_fold = False

    shipping_returns_near_cta = False
    if cta_node:
        scope_text = (cta_node.parent or cta_node).get_text(strip=True).lower()
        ship_ret_words = ["free shipping", "shipping", "delivery", "returns", "refund"]
        shipping_returns_near_cta = any(word in scope_text for word in ship_ret_words)

    image_elements = soup.find_all("img")
    image_count = len(image_elements)
    
    missing_alt_count = 0
    for image_element in image_elements:
        alt_text = image_element.get("alt") or ""
        if not alt_text.strip():
            missing_alt_count += 1
    # print(f"found {image_count} images, {missing_alt_count} missing alt text")  # debug

    alt_coverage = round((image_count - missing_alt_count) / image_count, 2) if image_count > 0 else 0.0

    testimonials = 0
    
    review_indicators = soup.find_all(string=re.compile(r'out of 5|based on \d+ reviews|customer review|reviewed by', re.I))
    if review_indicators:
        for indicator in review_indicators:
            match = re.search(r'based on (\d+) reviews', indicator, re.I)
            if match:
                testimonials = int(match.group(1))
                break
        if testimonials == 0:
            testimonials = len(review_indicators)
    
    if testimonials == 0:
        review_containers = soup.find_all(['div', 'section'], class_=re.compile(r'review|customer|testimonial', re.I))
        for container in review_containers:
            review_items = container.find_all(['div', 'article', 'li'], class_=re.compile(r'review|testimonial|customer', re.I))
            testimonials += len(review_items)
    
    if testimonials == 0:
        date_pattern = r'\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}'
        review_dates = soup.find_all(string=re.compile(date_pattern))
        testimonials = len(review_dates)

    stars_present = "★" in soup.get_text() or "rating" in soup.get_text().lower() or "reviews" in soup.get_text().lower()
    has_reviews_or_ratings = bool(testimonials or stars_present)

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

    security_badges = len(soup.find_all('img[alt*="secure"], [class*="security"], [class*="ssl"]'))
    guarantees = len(soup.find_all(string=re.compile(r'guarantee|warranty|refund|money back', re.I)))
    
    page_text_low = soup.get_text().lower()
    trust_words = ["guarantee", "warranty", "refund", "money back", "secure", "ssl"]
    trust_text_hits = sum(1 for word in trust_words if word in page_text_low)

    forms = soup.find_all('form')
    popups = soup.find_all(['[class*="modal"], [class*="popup"], [class*="overlay"]'])
    form_fields = sum(len(f.find_all('input, select, textarea')) for f in forms)

    headings = {}
    for i in range(1, 7):
        headings[f'h{i}_count'] = len(soup.find_all(f'h{i}'))

    viewport_present = bool(soup.find("meta", attrs={"name": "viewport"}))
    meta_desc = soup.find("meta", attrs={"name": "description"})
    meta_desc_content = (meta_desc.get("content") or "").strip() if meta_desc else ""
    meta_title_len = len(title)
    meta_desc_len = len(meta_desc_content)
    has_og = bool(soup.find("meta", attrs={"property": "og:title"}) or soup.find("meta", attrs={"property": "og:description"}))
    has_canonical = bool(soup.find("link", rel=lambda v: v and "canonical" in v))

    breadcrumbs_present = bool(soup.select_one('[aria-label="breadcrumb"], nav.breadcrumb, .breadcrumb'))
    related_products_present = bool(soup.select_one('[class*="related" i], [id*="related" i], [data-section*="related" i]'))
    has_search = bool(soup.select_one('input[type="search"], form[role="search"]'))

    scripts = soup.find_all("script")
    external_scripts = [s for s in scripts if s.get("src")]
    external_script_count = len(external_scripts)
    inline_script_count = len(scripts) - external_script_count
    html_bytes = len(response.text.encode("utf-8"))

    unlabeled_buttons = sum(1 for b in soup.find_all("button") if not (b.get_text(strip=True) or b.get("aria-label")))
    unlabeled_links = sum(1 for a in soup.find_all("a") if not (a.get_text(strip=True) or a.get("aria-label")))

    # Get structural analysis
    structure_data = summarize_structure(soup)

    return {
        # essentials
        "title": title,
        "h1": h1,
        "price": price,
        "cta": add_to_cart,

        # cta/price relationships
        "price_near_cta": price_near_cta,
        "cta_above_fold": cta_above_fold,
        "shipping_returns_near_cta": shipping_returns_near_cta,

        # imagery
        "image_count": image_count,
        "images_missing_alt": missing_alt_count,
        "alt_coverage": alt_coverage,

        # social proof
        "has_reviews_or_ratings": has_reviews_or_ratings,
        "testimonials": testimonials,
        "average_rating": average_rating,

        # trust
        "security_badges": security_badges,
        "guarantees": guarantees,
        "trust_text_hits": trust_text_hits,

        # forms / overlays
        "form_count": len(forms),
        "form_fields": form_fields,
        "popup_count": len(popups),

        # headings
        "headings": headings,

        # mobile & SEO hygiene
        "viewport_present": viewport_present,
        "meta_title_len": meta_title_len,
        "meta_description_len": meta_desc_len,
        "og_tags_present": has_og,
        "canonical_present": has_canonical,

        # findability
        "breadcrumbs_present": breadcrumbs_present,
        "related_products_present": related_products_present,
        "has_search": has_search,

        # perf proxies
        "html_bytes": html_bytes,
        "external_script_count": external_script_count,
        "inline_script_count": inline_script_count,

        # accessibility (quick)
        "a11y_unlabeled_buttons": unlabeled_buttons,
        "a11y_unlabeled_links": unlabeled_links,
        
        # structural analysis
        **structure_data
    }