import urllib.request
import urllib.error
import json
import socket

PORT = 3001
BASE_URL = f"http://localhost:{PORT}"

def test_auth():
    print("Testing Authentication Route Guard on /api/orders...")
    req = urllib.request.Request(f"{BASE_URL}/api/orders")
    try:
        urllib.request.urlopen(req)
        print("FAIL: Able to access protected endpoint without authentication!")
        return False
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print("PASS: Access denied with 401 Unauthorized.")
            return True
        else:
            print(f"FAIL: Expected 401, got {e.code}")
            return False

def test_dos_protection():
    print("Testing payload size limits (DoS prevention)...")
    # Send a payload that is ~150KB (limit is 100KB)
    large_payload = "A" * (150 * 1024)
    data = json.dumps({"password": large_payload}).encode('utf-8')
    req = urllib.request.Request(
        f"{BASE_URL}/api/login",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        urllib.request.urlopen(req)
        print("FAIL: Server accepted a 150KB login payload!")
        return False
    except (urllib.error.HTTPError, urllib.error.URLError, ConnectionResetError, socket.error) as e:
        print("PASS: Large payload was rejected/connection terminated by server.")
        return True

def test_price_tamper():
    print("Testing server-side price validation / tamper protection...")
    # Send a checkout payload with a fake extremely low price
    payload = {
        "items": [
            {
                "id": "margherita",
                "name": "Margherita",
                "price": 0.01 # Tampered! Margherita is $18.00
            }
        ],
        "customer": {
            "firstName": "Hacker",
            "lastName": "Tester",
            "phone": "555-0199"
        },
        "orderType": "pickup",
        "deliveryAddress": "",
        "paymentMethod": "cash"
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        f"{BASE_URL}/api/orders/place",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        res = urllib.request.urlopen(req)
        res_data = json.loads(res.read().decode('utf-8'))
        order_id = res_data.get("orderId")
        print(f"Order created with ID: {order_id}")
        
        # Now read orders.json directly from disk to verify the saved price/total
        with open("orders.json", "r", encoding="utf-8") as f:
            orders = json.load(f)
            placed_order = next((o for o in orders if o["id"] == order_id), None)
            
            if not placed_order:
                print("FAIL: Order was not found in orders.json")
                return False
                
            saved_total = placed_order["total"]
            saved_price = placed_order["items"][0]["price"]
            
            if saved_price == 18.0 and saved_total == 18.0:
                print("PASS: Server successfully recalculated and overrode tampered price!")
                return True
            else:
                print(f"FAIL: Server saved tampered values! Price: {saved_price}, Total: {saved_total}")
                return False
    except Exception as e:
        print(f"FAIL: Error occurred during test: {e}")
        return False

if __name__ == "__main__":
    tests = [test_auth, test_dos_protection, test_price_tamper]
    passed = all(test() for test in tests)
    if passed:
        print("\nALL SECURITY TESTS PASSED SUCCESSFULLY! [OK]")
    else:
        print("\nSOME SECURITY TESTS FAILED! [ERROR]")
