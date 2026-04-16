'use strict';

function buildQuery({ street, commune, city, country }) {
	const parts = [];
	if (street) parts.push(street);
	if (commune) parts.push(commune);
	if (city) parts.push(city);
	if (country) parts.push(country);
	return parts.join(', ');
}

async function geocodeAddressNominatim({ street, commune, city, country = 'Chile' }) {
	const q = buildQuery({
		street: street ? String(street).trim() : '',
		commune: commune ? String(commune).trim() : '',
		city: city ? String(city).trim() : '',
		country
	});

	if (!q || q.replace(/[, ]/g, '').length < 6) {
		return null;
	}

	const base = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
	const url = new URL('/search', base);
	url.searchParams.set('format', 'json');
	url.searchParams.set('limit', '1');
	url.searchParams.set('addressdetails', '0');
	url.searchParams.set('q', q);

	const controller = new AbortController();
	const timeoutMs = Number(process.env.NOMINATIM_TIMEOUT_MS || 7000);
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(url.toString(), {
			method: 'GET',
			signal: controller.signal,
			headers: {
				accept: 'application/json',
				// Nominatim requiere identificar la aplicación. En backend es seguro incluirlo.
				'user-agent':
					process.env.NOMINATIM_USER_AGENT || 'PetConnectBackend/1.0 (contacto: admin@petconnect.app)'
			}
		});

		if (!res.ok) {
			return null;
		}

		const data = await res.json();
		const first = Array.isArray(data) ? data[0] : null;
		if (!first || first.lat == null || first.lon == null) {
			return null;
		}

		const lat = Number(first.lat);
		const lng = Number(first.lon);
		if (Number.isNaN(lat) || Number.isNaN(lng)) {
			return null;
		}

		return { lat, lng, source: 'nominatim', query: q };
	} catch (err) {
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

module.exports = { geocodeAddressNominatim };
