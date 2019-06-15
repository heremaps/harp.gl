const s3Base = 'http://harp.gl.s3-website-us-east-1.amazonaws.com/docs/';

//Update initial links to s3 base
document.querySelector('.examples-link').href = s3Base + 'master/examples/';
document.querySelector('.docs-link').href = s3Base + 'master/doc/';

const releases = [{
   date: 'master',
   hash: 'master'
}]
const dropdown = document.querySelector('select[name=versions]');

fetch('https://heremaps.github.io/harp.gl/releases.json')
.then(res => res.json())
.then(res => {
   
   releases.push(...res);
   releases.forEach(release => {
      const option = document.createElement('option');
      option.innerText = release.date;
      dropdown.appendChild(option);
   })

   dropdown.onchange = () => {
      const selected = dropdown.querySelector('option:checked');
      const hash = releases.filter(x => x.date === selected.innerText)[0].hash;
      const date = releases.filter(x => x.date === selected.innerText)[0].date;

      //Update examples button and link
      document.querySelector('.examples-link').href = s3Base + hash + '/examples';
      document.querySelector('.examples-link').innerText = 'Examples' + (date !== 'master' ? ` (${date})` : '');

      //Update docs button and link
      document.querySelector('.docs-link').href = s3Base + hash + '/doc';
      document.querySelector('.docs-link').innerText = 'Documentation' + (date !== 'master' ? ` (${date})` : '');
   }
}).catch(() => {
   
   //In case network request to build information fails, add master link
   const option = document.createElement('option');
   option.innerText = 'master';
   dropdown.appendChild(option);
})

setTimeout(() => {
   document.querySelector('header').style.backgroundImage = `url('img/background.png')`;
}, 1000)