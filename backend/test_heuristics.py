#!/usr/bin/env python3

from heuristic import run_heuristics

def test_analysis():
    url = "https://www.socolachocolates.com/collections/chocolate-truffles/products/assorted-chocolate-truffle-box"
    
    print(f"Testing analysis for: {url}")
    print("=" * 60)
    
    try:
        results = run_heuristics(url)
        
        print("ANALYSIS RESULTS:")
        print(f"Title: {results['title']}")
        print(f"H1: {results['h1']}")
        print(f"Price: {results['price']}")
        print(f"CTA: {results['cta']}")
        print(f"Images: {results['image_count']}")
        print(f"Missing Alt Text: {results['images_missing_alt']}")
        print(f"Testimonials: {results['testimonials']}")
        print(f"Security Badges: {results['security_badges']}")
        print(f"Forms: {results['form_count']}")
        print(f"Popups: {results['popup_count']}")
        print(f"Headings: {results['headings']}")
        
        print("\n" + "=" * 60)
        print("EXPECTED vs ACTUAL:")
        print(f"Price: Expected '$49.00', Got '{results['price']}'")
        print(f"H1: Expected 'Assorted Chocolate Truffle Box', Got '{results['h1']}'")
        print(f"Testimonials: Expected 8, Got {results['testimonials']}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_analysis()
