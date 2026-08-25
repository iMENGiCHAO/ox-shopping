require('dotenv').config();
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const value={
    homeLeft:{href:"/products?category=x-collection",image:"/images/xcom2/banner-x.jpg",title:"X Collection"},
    homeRight:{href:"/products?category=spacexai-collection",image:"/images/xcom2/banner-xai.jpg",title:"SpaceXAI Collection"},
    collectionsFallbackImage:"/images/xcom2/banner-x.jpg",
  };
  await p.siteSetting.upsert({where:{key:'pageBanners'},update:{value},create:{key:'pageBanners',value}});
  console.log('pageBanners updated');
  await p.$disconnect();
})();
