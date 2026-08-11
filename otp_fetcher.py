import asyncio
import sys
import json
import re
from datetime import datetime, timezone
from telethon import TelegramClient, functions
from telethon.sessions import StringSession

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

async def fetch_otp_and_check_login(session_str):
    try:
        client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
        await client.connect()
        
        if not await client.is_user_authorized():
            return {"error": "Session is invalid or expired"}
            
        # 1. Fetch latest OTP message from 777000
        target_id = 777000
        messages = await client.get_messages(target_id, limit=5)
        
        otp_data = None
        if messages:
            for msg in messages:
                text = msg.text
                if not otp_data and re.search(r'\b\d{5,6}\b', text):
                    otp_data = {
                        "text": text,
                        "date": msg.date.timestamp()
                    }
                    break

        # 2. Get all authorizations to find the latest login
        latest_auth_date = 0
        try:
            authorizations = await client(functions.account.GetAuthorizationsRequest())
            for auth in authorizations.authorizations:
                if not auth.current:
                    auth_ts = auth.date.timestamp()
                    if auth_ts > latest_auth_date:
                        latest_auth_date = auth_ts
        except Exception as auth_err:
            pass

        return {
            "otp": otp_data,
            "latest_auth_date": latest_auth_date,
            "session_count": len(authorizations.authorizations) if 'authorizations' in locals() else 1
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
