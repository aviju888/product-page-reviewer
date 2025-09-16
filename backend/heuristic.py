import requests
import re
from bs4 import BeautifulSoup

def run_heuristics(url: str) -> dict:
    # print(f"fetching url: {url}")  # debug
    response = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    # print(f"successfully parsed html, title: {soup.title.string if soup.title else 'None'}")  # debug

    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    
    # Find the most relevant H1 - prefer product titles over cart/UI elements
    h1 = ""
    h1_elements = soup.find_all("h1")
    
    # First, try to find H1 that contains product-related keywords
    product_keywords = ["chocolate", "truffle", "box", "assorted", "product", "item"]
    for h1_elem in h1_elements:
        h1_text = h1_elem.get_text(strip=True)
        if any(keyword in h1_text.lower() for keyword in product_keywords):
            h1 = h1_text
            break
    
    # If no product H1 found, skip UI elements
    if not h1:
        for h1_elem in h1_elements:
            h1_text = h1_elem.get_text(strip=True)
            # Skip common UI elements and look for product-related content
            if not any(ui_word in h1_text.lower() for ui_word in ["cart", "checkout", "login", "sign in", "menu", "navigation", "your"]):
                h1 = h1_text
                break
    
    # If no good H1 found, look for the product title in other heading tags
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
    
    # If still no good H1 found, use the first H1
    if not h1 and h1_elements:
        h1 = h1_elements[0].get_text(strip=True)
    price = ""
    # First try specific price selectors
    price_selectors = [".price", "[class*=price]", "[id*=price]"]
    for selector in price_selectors:
        price_element = soup.select_one(selector)
        if price_element and price_element.get_text(strip=True):
            price = price_element.get_text(strip=True)
            # print(f"found price: {price}")  # debug
            break
    
    # If no price found, search for dollar amounts in text
    if not price:
        price_pattern = r'\$[\d,]+\.?\d*'
        all_text = soup.get_text()
        price_matches = re.findall(price_pattern, all_text)
        if price_matches:
            # Get the first price that looks like a product price (not shipping, etc.)
            for match in price_matches:
                # Skip very small amounts that might be shipping costs
                amount = float(match.replace('$', '').replace(',', ''))
                if amount >= 10:  # Assume product prices are at least $10
                    price = match
                    break

    add_to_cart = None
    cta_texts = [
        "add to cart", "buy now", "checkout", "get started", "sign up", 
        "download", "try free", "learn more", "get for", "purchase",
        "order now", "shop now", "subscribe", "join", "start"
    ]
    for cta_text in cta_texts:
        button_elements = soup.find_all(["button", "a"])
        for button_element in button_elements:
            button_text = button_element.get_text(strip=True).lower()
            if cta_text in button_text:
                add_to_cart = button_element.get_text(strip=True)
                # print(f"found cta: {add_to_cart}")  # debug
                break
        if add_to_cart:
            break

    image_elements = soup.find_all("img")
    image_count = len(image_elements)
    
    # count images missing alt text
    missing_alt_count = 0
    for image_element in image_elements:
        alt_text = image_element.get("alt") or ""
        if not alt_text.strip():
            missing_alt_count += 1
    # print(f"found {image_count} images, {missing_alt_count} missing alt text")  # debug

    # some trust signals
    # Count testimonials more broadly - look for review sections, customer names, and review content
    testimonials = 0
    
    # First, try to extract the number from "Based on X reviews" text
    review_indicators = soup.find_all(string=re.compile(r'out of 5|based on \d+ reviews|customer review|reviewed by', re.I))
    if review_indicators:
        # Try to extract the number from "Based on X reviews"
        for indicator in review_indicators:
            match = re.search(r'based on (\d+) reviews', indicator, re.I)
            if match:
                testimonials = int(match.group(1))
                break
        # If no number found, count the indicators
        if testimonials == 0:
            testimonials = len(review_indicators)
    
    # If no testimonials found from text patterns, look for review containers
    if testimonials == 0:
        review_containers = soup.find_all(['div', 'section'], class_=re.compile(r'review|customer|testimonial', re.I))
        for container in review_containers:
            # Count individual review items within containers
            review_items = container.find_all(['div', 'article', 'li'], class_=re.compile(r'review|testimonial|customer', re.I))
            testimonials += len(review_items)
    
    # If still no testimonials found, look for individual review entries by searching for date patterns
    if testimonials == 0:
        # Look for date patterns that often appear in reviews (MM/DD/YYYY or similar)
        date_pattern = r'\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}'
        review_dates = soup.find_all(string=re.compile(date_pattern))
        testimonials = len(review_dates)
    
    security_badges = len(soup.find_all('img[alt*="secure"], [class*="security"], [class*="ssl"]'))
    guarantees = len(soup.find_all(string=re.compile(r'guarantee|warranty|refund|money back', re.I)))

    # forms and popups
    forms = soup.find_all('form')
    popups = soup.find_all(['[class*="modal"], [class*="popup"], [class*="overlay"]'])
    form_fields = sum(len(f.find_all('input, select, textarea')) for f in forms)

    # headings
    headings = {}
    for i in range(1, 7):
        headings[f'h{i}_count'] = len(soup.find_all(f'h{i}'))

    return {
        "title": title,
        "h1": h1,
        "price": price,
        "cta": add_to_cart,
        "image_count": image_count,
        "images_missing_alt": missing_alt_count,
        "testimonials": testimonials,
        "security_badges": security_badges,
        "guarantees": guarantees,
        "form_count": len(forms),
        "popup_count": len(popups),
        "form_fields": form_fields,
        "headings": headings
    }