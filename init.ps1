npx -y create-next-app@15 app_temp --typescript --eslint --app --src-dir false --import-alias "@/*" --use-npm --no-tailwind --disable-git
Get-ChildItem -Path app_temp -Force | Move-Item -Destination . -Force
Remove-Item -Path app_temp -Recurse -Force
