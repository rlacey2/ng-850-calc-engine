rem Checkout/Create Orphan Branch – Create a new orphan branch in your git repository. This branch will not show in git branch command.

git checkout --orphan latest_branch

rem Add All The Files to Branch – Add all existing files to your newly created branch.

git add -A

rem Commit The Changes – After adding all files to your new branch, commit the changes

git commit -am "first commit"

rem Delete Main (Default) Branch – Now you can delete the main (default) branch from your git repository. This step is permanent.

git branch -D main

rem Rename The Current Branch – After deleting the old main (default) branch, rename the newly created branch to main.

git branch -m main

rem Push Changes – All these changes are completed on your local repository and now its time to force push these changes to your remote repository.

git push -f origin main
