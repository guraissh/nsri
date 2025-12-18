#!/usr/bin/env python3
"""
Test script for Bunkr album scraper
Usage: python test_scraper.py <album_url>
"""

import sys
import requests
import json

def test_bunkr_scraper(album_url):
    """Test the Bunkr backend API with a given album URL"""

    backend_url = "http://localhost:8001"
    endpoint = f"{backend_url}/api/album"

    print(f"Testing Bunkr scraper with album: {album_url}")
    print(f"Backend endpoint: {endpoint}")
    print("-" * 80)

    try:
        # Make request to Bunkr backend
        response = requests.get(
            endpoint,
            params={"url": album_url},
            timeout=60
        )

        print(f"Status Code: {response.status_code}")
        print("-" * 80)

        if response.status_code == 200:
            data = response.json()

            print(f"Album URL: {data.get('album_url')}")
            print(f"Total Items: {data.get('total_items')}")
            print("-" * 80)

            media = data.get('media', [])

            if not media:
                print("❌ No media items found!")
                return False

            print(f"✅ Found {len(media)} media items:")
            print()

            for i, item in enumerate(media[:10], 1):  # Show first 10
                print(f"Item {i}:")
                print(f"  Type: {item.get('type')}")
                print(f"  URL: {item.get('url')}")
                print(f"  Filename: {item.get('filename')}")
                if item.get('file_page'):
                    print(f"  File Page: {item.get('file_page')}")
                print()

            if len(media) > 10:
                print(f"... and {len(media) - 10} more items")
                print()

            # Verify all items have URLs
            items_without_urls = [i for i, item in enumerate(media, 1) if not item.get('url')]
            if items_without_urls:
                print(f"⚠️  Warning: {len(items_without_urls)} items missing CDN URLs:")
                for idx in items_without_urls[:5]:
                    print(f"  - Item {idx}")
                if len(items_without_urls) > 5:
                    print(f"  ... and {len(items_without_urls) - 5} more")
                return False

            print("✅ All items have CDN URLs!")
            return True

        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            return False

    except requests.RequestException as e:
        print(f"❌ Request failed: {str(e)}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON response: {str(e)}")
        print(f"Response: {response.text[:500]}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_scraper.py <album_url>")
        print()
        print("Example:")
        print("  python test_scraper.py https://bunkr.cr/a/6RthdZkH")
        sys.exit(1)

    album_url = sys.argv[1]
    success = test_bunkr_scraper(album_url)

    sys.exit(0 if success else 1)
