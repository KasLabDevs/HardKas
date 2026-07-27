const fs=require('fs');
const pkgs=fs.readdirSync('packages');
pkgs.forEach(pkgDir => {
  const p = 'packages/' + pkgDir + '/package.json';
  if(!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p));
  if(data.private) return;
  
  data.publishConfig = { access: 'public' };
  
  if(!data.files){
    if(data.name === '@hardkas/pskt-native'){
      data.files = ['index.js','index.d.ts','*.node'];
    } else {
      data.files = ['dist'];
    }
  } else {
    if(data.name === '@hardkas/pskt-native'){
      if(!data.files.includes('*.node')) data.files.push('*.node');
    } else {
      if(!data.files.includes('dist')) data.files.push('dist');
    }
  }
  
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  console.log('Fixed', p);
});
