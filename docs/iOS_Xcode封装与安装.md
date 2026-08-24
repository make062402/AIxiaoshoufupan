# iOS Xcode 封装与安装

本项目使用 Capacitor 将现有 React 前端封装为原生 iOS App。Xcode 工程位于：

`frontend/ios/App/App.xcodeproj`

App 信息：

- 名称：AI 销售复盘助手
- Bundle Identifier：`com.aixiaoshou.review`
- 最低系统版本：iOS 15.0
- 当前版本：1.0（Build 1）
- 生产接口：`https://xiaoshoufupan.woshimake.com/api`

## 构建并在模拟器运行

在项目根目录执行：

```bash
cd frontend
VITE_API_BASE_URL=https://xiaoshoufupan.woshimake.com/api npm run ios:build
```

构建成功后会看到 `BUILD SUCCEEDED`，模拟器 App 位于：

`frontend/ios/App/DerivedData/Build/Products/Debug-iphonesimulator/App.app`

也可以直接同步资源并打开 Xcode：

```bash
cd frontend
VITE_API_BASE_URL=https://xiaoshoufupan.woshimake.com/api npm run ios:open
```

在 Xcode 顶部选择一个 iPhone Simulator，点击三角形运行按钮即可。

## 安装到自己的 iPhone

1. 用数据线连接 iPhone 和 Mac，并在手机上点击“信任”。
2. 打开 `frontend/ios/App/App.xcodeproj`。
3. 在 Xcode 左侧选择蓝色的 **App** 项目，再选择 **App** Target。
4. 打开 **Signing & Capabilities**，勾选 **Automatically manage signing**。
5. 在 **Team** 中选择自己的 Apple ID 团队；如果没有，先到 Xcode 的 **Settings > Accounts** 登录 Apple ID。
6. 在 Xcode 顶部设备列表中选择已连接的 iPhone，点击运行按钮。
7. 如果手机提示开发者不受信任，在 iPhone 的 **设置 > 通用 > VPN 与设备管理** 中信任对应开发者，然后再次启动。

普通 Apple ID 可以在自己的设备上测试，但免费签名通常需要定期重新安装。通过 TestFlight 或 App Store 长期分发，需要加入 [Apple Developer Program](https://developer.apple.com/programs/enroll/)。

## 每次修改前端后的同步步骤

修改网页代码后，不要直接在 Xcode 中只点运行。先重新生成 Web 资源并同步：

```bash
cd frontend
VITE_API_BASE_URL=https://xiaoshoufupan.woshimake.com/api npm run build:ios:web
npm run ios:sync
```

然后回到 Xcode 再次运行。

## 发布 App Store

1. 在 Apple Developer 和 App Store Connect 中创建与 `com.aixiaoshou.review` 对应的 App。
2. 在 Xcode 中选择 **Any iOS Device (arm64)**。
3. 点击 **Product > Archive**。
4. 在 Organizer 中选择归档，点击 **Distribute App > App Store Connect** 上传。
5. 在 App Store Connect 补齐截图、隐私说明、年龄分级、支持网址等资料，再提交审核。

正式发布前应将版本号和 Build 号递增，并在真机上完成全部业务流程测试。
