#!/usr/bin/env python3
"""Check products in the database"""

import psycopg2
from psycopg2.extras import RealDictCursor
import json

# Database configuration
DB_CONFIG = {
    "host": "49.12.191.119",
    "port": 5456,
    "database": "amazon_monitor",
    "user": "saas",
    "password": "saas_password_123"
}

def check_products():
    """Check products in the database"""
    try:
        conn = psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
        cur = conn.cursor()
        
        # First, let's check if there's a products table
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE '%product%'
            ORDER BY table_name
        """)
        
        print("Tables with 'product' in name:")
        print("-" * 50)
        tables = cur.fetchall()
        for table in tables:
            print(f"  - {table['table_name']}")
        
        # Check the products table if it exists
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'products' 
            AND table_schema = 'public'
            ORDER BY ordinal_position
        """)
        
        columns = cur.fetchall()
        if columns:
            print("\nColumns in 'products' table:")
            print("-" * 50)
            for col in columns:
                print(f"  - {col['column_name']}: {col['data_type']}")
        
        # Get sample products
        cur.execute("""
            SELECT 
                id,
                asin,
                sku,
                title,
                brand,
                category,
                price,
                currency_code,
                in_stock,
                image_url
            FROM products
            WHERE title IS NOT NULL
            ORDER BY id
            LIMIT 20
        """)
        
        products = cur.fetchall()
        
        print(f"\nSample Products (showing first 20):")
        print("=" * 80)
        
        for i, product in enumerate(products, 1):
            print(f"\n{i}. {product.get('title', 'No title')}")
            print(f"   ASIN: {product.get('asin', 'N/A')}")
            print(f"   SKU: {product.get('sku', 'N/A')}")
            print(f"   Brand: {product.get('brand', 'N/A')}")
            print(f"   Category: {product.get('category', 'N/A')}")
            print(f"   Price: ${product.get('price', 0):.2f} {product.get('currency_code', 'USD')}")
            print(f"   In Stock: {product.get('in_stock', False)}")
            if product.get('image_url'):
                print(f"   Image: {product['image_url'][:50]}...")
        
        # Get product statistics
        cur.execute("""
            SELECT 
                COUNT(*) as total_products,
                COUNT(DISTINCT asin) as unique_asins,
                COUNT(DISTINCT sku) as unique_skus,
                COUNT(DISTINCT brand) as unique_brands,
                COUNT(DISTINCT category) as unique_categories,
                AVG(price) as avg_price,
                MIN(price) as min_price,
                MAX(price) as max_price
            FROM products
        """)
        
        stats = cur.fetchone()
        
        print("\n" + "=" * 80)
        print("Product Statistics:")
        print("-" * 50)
        print(f"Total Products: {stats['total_products']}")
        print(f"Unique ASINs: {stats['unique_asins']}")
        print(f"Unique SKUs: {stats['unique_skus']}")
        print(f"Unique Brands: {stats['unique_brands']}")
        print(f"Unique Categories: {stats['unique_categories']}")
        print(f"Average Price: ${stats['avg_price']:.2f}" if stats['avg_price'] else "Average Price: N/A")
        print(f"Price Range: ${stats['min_price']:.2f} - ${stats['max_price']:.2f}" if stats['min_price'] else "Price Range: N/A")
        
        # Check for product images
        cur.execute("""
            SELECT 
                COUNT(*) as products_with_images,
                COUNT(DISTINCT image_url) as unique_images
            FROM products
            WHERE image_url IS NOT NULL AND image_url != ''
        """)
        
        image_stats = cur.fetchone()
        print(f"\nProducts with Images: {image_stats['products_with_images']}")
        print(f"Unique Images: {image_stats['unique_images']}")
        
        # Get top categories
        cur.execute("""
            SELECT 
                category,
                COUNT(*) as product_count
            FROM products
            WHERE category IS NOT NULL
            GROUP BY category
            ORDER BY product_count DESC
            LIMIT 10
        """)
        
        categories = cur.fetchall()
        
        if categories:
            print("\nTop Categories:")
            print("-" * 50)
            for cat in categories:
                print(f"  - {cat['category']}: {cat['product_count']} products")
        
        # Get top brands
        cur.execute("""
            SELECT 
                brand,
                COUNT(*) as product_count
            FROM products
            WHERE brand IS NOT NULL
            GROUP BY brand
            ORDER BY product_count DESC
            LIMIT 10
        """)
        
        brands = cur.fetchall()
        
        if brands:
            print("\nTop Brands:")
            print("-" * 50)
            for brand in brands:
                print(f"  - {brand['brand']}: {brand['product_count']} products")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_products()