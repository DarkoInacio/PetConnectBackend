'use strict';

const path = require('path');
const fs = require('fs');

/**
 * En Render conviene montar un disco persistente y apuntar UPLOADS_DIR a ese path (p. ej. /var/data/uploads).
 * En local se usa /src/uploads por defecto.
 */
const uploadsRoot = process.env.UPLOADS_DIR
	? path.resolve(String(process.env.UPLOADS_DIR))
	: path.join(__dirname, '..', 'uploads');

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

ensureDir(uploadsRoot);
ensureDir(path.join(uploadsRoot, 'pets'));
ensureDir(path.join(uploadsRoot, 'clinical'));

module.exports = {
	uploadsRoot,
	ensureDir
};

