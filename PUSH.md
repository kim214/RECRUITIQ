# Push to GitHub

Your code is committed locally and ready to push. Run these commands in PowerShell from the project folder.

## 1. Verify setup

```powershell
cd C:\Users\HP\Desktop\REQRUITIQ
git status
git remote -v
```

Expected remote:
```
https://github.com/kim214/RECRUITIQ.git
```

You should see: `Your branch is ahead of 'origin/main' by 2 commits`

## 2. Push

```powershell
git push -u origin main
```

## 3. If push fails — common fixes

### "Authentication failed" or "Permission denied"

GitHub no longer accepts account passwords. Use a **Personal Access Token**:

1. Go to https://github.com/settings/tokens
2. **Generate new token (classic)** → enable `repo` scope
3. Copy the token
4. When Git asks for password, paste the **token** (not your GitHub password)

Or sign in via Git Credential Manager when prompted.

### "Failed to connect" / network error

- Check your internet connection
- Try again in a few minutes
- If on restricted network/VPN, switch network or use mobile hotspot

### "Updates were rejected" (remote has new commits)

```powershell
git pull origin main --rebase
git push origin main
```

### Wrong repository URL

If your repo URL is different, update it:

```powershell
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## 4. What gets pushed

- Full platform code (backend, frontend, AI service, Supabase schema)
- `.env.example` files only — **your real `.env` files are gitignored and will NOT upload**

## 5. After successful push

View your code at: https://github.com/kim214/RECRUITIQ
