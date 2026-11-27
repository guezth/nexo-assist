#!/bin/bash
set -e

# Script para rodar o Nexo Assist com volume persistente.
# O volume 'nexo-data' guarda o SQLite entre reinicializações.

CONTAINER_NAME="nexo-assist"
VOLUME_NAME="nexo-data"
PORT="3000"
SESSION_SECRET="4ed24ab95e87ade8ed791d0c6657367aaa1146592137a3add69a994efaa40cba"

echo "🔧 Parando container existente (se houver)..."
if docker ps -q -f "name=$CONTAINER_NAME" >/dev/null 2>&1; then
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
    echo "   Container anterior removido."
fi

echo "📦 Criando/verificando volume persistente '$VOLUME_NAME'..."
if ! docker volume ls -q -f "name=$VOLUME_NAME" >/dev/null 2>&1; then
    docker volume create "$VOLUME_NAME" >/dev/null
    echo "   Volume criado."
else
    echo "   Volume já existe."
fi

echo "🚀 Iniciando novo container..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -p "${PORT}:3000" \
    -v "${VOLUME_NAME}:/app/data" \
    -e "SESSION_SECRET=$SESSION_SECRET" \
    nexo-assist

echo "✅ Container iniciado com sucesso!"
echo "   Acesse: http://localhost:$PORT"
echo "   Volume persistente: docker volume inspect $VOLUME_NAME"
