/** USDT on Ethereum mainnet uses standard ERC20 address format */
const ERC20_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function isValidErc20Address(value) {
  return typeof value === 'string' && ERC20_ADDRESS_REGEX.test(value.trim());
}

export function normalizeErc20Address(value) {
  return typeof value === 'string' ? value.trim() : '';
}
