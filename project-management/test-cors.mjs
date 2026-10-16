const url = 'https://corsproxy.io/?url=' + encodeURIComponent('https://firebasestorage.googleapis.com/v0/b/incaptta-pro.firebasestorage.app/o/app%2Fseal_1772612206667_sealincaptta3.png?alt=media&token=05244de8-ddc6-4e53-b7a2-f6980a965b59');
console.log('Fetching', url);
const response = await fetch(url);
console.log('Status', response.status);
console.log('CORS Header', response.headers.get('access-control-allow-origin'));
