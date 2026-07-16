export function buildWhatsAppClientLink(rawPhone: string | null | undefined, message: string): string | null {
  if (!rawPhone) return null;
  let phone = rawPhone.replace(/\D/g, '');
  if (phone.length === 10) {
    phone = '52' + phone;
  } else if (phone.length === 13 && phone.startsWith('521')) {
    phone = '52' + phone.slice(3);
  }
  if (phone.length !== 12) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppGroupLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
