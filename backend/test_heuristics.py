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
        print("CONVERSION SCORES:")
        if 'conversion_scores' in results:
            scores = results['conversion_scores']
            print(f"Overall Score: {scores.get('overall_score', 'N/A')}/10")
            print(f"Value Proposition Clarity: {scores.get('value_proposition_clarity', 'N/A')}/10")
            print(f"CTA Effectiveness: {scores.get('cta_effectiveness', 'N/A')}/10")
            print(f"Trust & Social Proof: {scores.get('trust_social_proof', 'N/A')}/10")
            print(f"Visual Imagery: {scores.get('visual_imagery', 'N/A')}/10")
            print(f"Mobile & Accessibility: {scores.get('mobile_accessibility', 'N/A')}/10")
            print(f"Technical Performance: {scores.get('technical_performance', 'N/A')}/10")
            print(f"User Experience: {scores.get('user_experience', 'N/A')}/10")
            print(f"Conversion Optimization: {scores.get('conversion_optimization', 'N/A')}/10")
        else:
            print("No conversion scores available")
        
        print("\n" + "=" * 60)
        print("EXPECTED vs ACTUAL:")
        print(f"Price: Expected '$49.00', Got '{results['price']}'")
        print(f"H1: Expected 'Assorted Chocolate Truffle Box', Got '{results['h1']}'")
        print(f"Testimonials: Expected 8, Got {results['testimonials']}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_analysis()
