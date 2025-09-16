import requests
from bs4 import BeautifulSoup

def run_heuristics(url: str) -> dict:
    # print(f"fetching url: {url}")  # debug
    response = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    # print(f"successfully parsed html, title: {soup.title.string if soup.title else 'None'}")  # debug

    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    h1 = soup.find("h1").get_text(strip=True) if soup.find("h1") else ""
    price = ""
    price_selectors = [".price", "[class*=price]", "[id*=price]"]
    for selector in price_selectors:
        price_element = soup.select_one(selector)
        if price_element and price_element.get_text(strip=True):
            price = price_element.get_text(strip=True)
            # print(f"found price: {price}")  # debug
            break

    add_to_cart = None
    cta_texts = ["add to cart", "buy now", "checkout"]
    for cta_text in cta_texts:
        # look for buttons or links with the cta text
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

    return {
        "title": title,
        "h1": h1,
        "price": price,
        "cta": add_to_cart,
        "image_count": image_count,
        "images_missing_alt": missing_alt_count
    }