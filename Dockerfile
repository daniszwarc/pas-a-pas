FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css manifest.webmanifest sw.js /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
COPY js /usr/share/nginx/html/js
COPY data /usr/share/nginx/html/data
EXPOSE 80
