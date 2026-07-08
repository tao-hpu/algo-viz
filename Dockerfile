# 多阶段构建：pnpm 打包静态资源 → nginx 托管
FROM node:22-alpine AS builder
WORKDIR /app
# 钉 pnpm 9：默认会执行依赖的构建脚本（esbuild 需要），不像 pnpm 10 那样默认拦截
RUN npm install -g pnpm@9
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
