# Fix Git Author History

This document provides instructions for rewriting git history to fix incorrect author name/email.

## Prerequisites

- You are the only contributor (or have coordinated with all contributors)
- You have push access to the remote repository
- You understand this requires a force push and will rewrite history

## Step 1: Set Correct Identity for Future Commits

```bash
git config --global user.name "YOUR_NAME"
git config --global user.email "YOUR_EMAIL"
```

## Step 2: Check Current History

See what emails are in your commit history:

```bash
git log --all --format='%ae' | sort | uniq -c
```

## Step 3: Rewrite History

Replace the placeholder values below with your actual old and new credentials:

```bash
# Set these variables first
OLD_EMAIL="old-email@example.com"
NEW_NAME="Your Name"
NEW_EMAIL="correct-email@example.com"

# Stash any uncommitted changes
git stash

# Rewrite history
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --env-filter "
if [ \"\$GIT_AUTHOR_EMAIL\" = \"$OLD_EMAIL\" ]; then
    export GIT_AUTHOR_NAME=\"$NEW_NAME\"
    export GIT_AUTHOR_EMAIL=\"$NEW_EMAIL\"
fi
if [ \"\$GIT_COMMITTER_EMAIL\" = \"$OLD_EMAIL\" ]; then
    export GIT_COMMITTER_NAME=\"$NEW_NAME\"
    export GIT_COMMITTER_EMAIL=\"$NEW_EMAIL\"
fi
" --tag-name-filter cat -- --branches --tags
```

## Step 4: Verify

```bash
# Check that all commits now have correct email
git log --all --format='%ae' | sort | uniq -c

# Should show only your correct email
```

## Step 5: Clean Up and Push

```bash
# Remove backup refs created by filter-branch
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin

# Force push to remote (CAUTION: this rewrites remote history)
git push --force origin main

# Restore any stashed changes
git stash pop
```

## Troubleshooting

### "Cannot rewrite branches: You have unstaged changes"

Run `git stash` before the filter-branch command, then `git stash pop` after.

### Multiple old emails to fix

Run the filter-branch command multiple times, once for each old email, or modify the script to check for multiple emails:

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --env-filter '
if [ "$GIT_AUTHOR_EMAIL" = "old1@example.com" ] || [ "$GIT_AUTHOR_EMAIL" = "old2@example.com" ]; then
    export GIT_AUTHOR_NAME="Your Name"
    export GIT_AUTHOR_EMAIL="correct@example.com"
fi
if [ "$GIT_COMMITTER_EMAIL" = "old1@example.com" ] || [ "$GIT_COMMITTER_EMAIL" = "old2@example.com" ]; then
    export GIT_COMMITTER_NAME="Your Name"
    export GIT_COMMITTER_EMAIL="correct@example.com"
fi
' --tag-name-filter cat -- --branches --tags
```

### Already ran filter-branch and want to run again

```bash
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin
```

Then run filter-branch again.

## Warning

This rewrites git history. Anyone who has cloned the repository will need to re-clone or run:

```bash
git fetch origin
git reset --hard origin/main
```
